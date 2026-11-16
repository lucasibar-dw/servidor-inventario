import { EntitySubscriberInterface, EventSubscriber, InsertEvent, IsNull } from 'typeorm';
import { MovimientoEntity, TipoMovimiento } from '../../../modules/warehouse/infrastructure/persistence/entities/movimiento.entity';
import { StockBalanceEntity } from '../../../modules/warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { PositionEntity } from '../../../modules/warehouse/infrastructure/persistence/entities/depot.entity';
import { ItemEntity } from '../../../modules/config/infrastructure/persistence/entities/item.entity';

@EventSubscriber()
export class MovimientoSubscriber implements EntitySubscriberInterface<MovimientoEntity> {
    listenTo() {
        return MovimientoEntity;
    }

    async afterInsert(event: InsertEvent<MovimientoEntity>) {
        const mov = event.entity;
        const manager = event.manager;

        // Determinar el factor multiplicador según el tipo de movimiento
        let multiplier = 0;
        switch (mov.tipo) {
            case TipoMovimiento.REMITO_ENTRADA:
            case TipoMovimiento.AJUSTE_SUMA:
            case TipoMovimiento.ANULACION_SALIDA:
            case TipoMovimiento.ANULACION_AJUSTE_RESTA:
            case TipoMovimiento.ANULACION_ENTREGA_PRODUCCION:
            case TipoMovimiento.DEVOLUCION_LINEA:
            case TipoMovimiento.INGRESO_PRODUCCION:
                multiplier = 1;
                break;
            case TipoMovimiento.REMITO_SALIDA:
            case TipoMovimiento.AJUSTE_RESTA:
            case TipoMovimiento.ANULACION_ENTRADA:
            case TipoMovimiento.ANULACION_AJUSTE_SUMA:
            case TipoMovimiento.ENTREGA_PRODUCCION:
            case TipoMovimiento.ANULACION_DEVOLUCION_LINEA:
            case TipoMovimiento.ANULACION_INGRESO_PRODUCCION:
                multiplier = -1;
                break;
            case TipoMovimiento.MOVE_INTERNO:
                multiplier = 1; 
                break;
        }

        if (multiplier === 0) return;

        const deltaPrincipal = Number(mov.qtyPrincipal) * multiplier;
        const deltaSecundaria = mov.qtySecundaria != null ? Number(mov.qtySecundaria) * multiplier : null;

        // Cargar posición e item para obtener depósito y proveedor de forma indirecta/segura
        const position = await manager.findOne(PositionEntity, { where: { id: mov.posicionId } });
        const item = await manager.findOne(ItemEntity, { where: { id: mov.itemId } });

        const resolvedDepositoId = position ? position.depositoId : (mov as any).depositoId;
        const resolvedSupplierId = item ? item.supplierId : (mov as any).supplierId;

        if (!resolvedDepositoId) return;

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            `stock:${mov.posicionId}`,
            `${mov.itemId}:${mov.lotId ?? 'SIN_LOTE'}`,
        ]);

        // 1. Buscar registro de balance actual
        let balance = await manager.findOne(StockBalanceEntity, {
            where: {
                depositoId: resolvedDepositoId,
                posicionId: mov.posicionId,
                itemId: mov.itemId,
                lotId: mov.lotId || IsNull(),
            },
            lock: { mode: 'pessimistic_write' },
        });

        if (balance) {
            // 2. Actualizar balance existente
            const nextPrincipal = Number(balance.qtyPrincipal) + deltaPrincipal;
            const nextSecondary = deltaSecundaria === null
                ? Number(balance.qtySecundaria ?? 0)
                : Number(balance.qtySecundaria ?? 0) + deltaSecundaria;
            if (nextPrincipal < 0 || nextSecondary < 0) {
                throw new Error('El movimiento intentó dejar el stock en negativo.');
            }
            balance.qtyPrincipal = nextPrincipal;
            if (deltaSecundaria !== null) {
                balance.qtySecundaria = nextSecondary;
            }

            if (Number(balance.qtyPrincipal) <= 0 && Number(balance.qtySecundaria ?? 0) <= 0) {
                await manager.remove(StockBalanceEntity, balance);
            } else {
                await manager.save(StockBalanceEntity, balance);
            }
        } else if (multiplier > 0) {
            // 3. Crear nuevo balance (sólo si es suma)
            balance = manager.create(StockBalanceEntity, {
                depositoId: resolvedDepositoId,
                posicionId: mov.posicionId,
                itemId: mov.itemId,
                lotId: mov.lotId,
                supplierId: resolvedSupplierId,
                qtyPrincipal: mov.qtyPrincipal,
                qtySecundaria: mov.qtySecundaria,
            });
            await manager.save(StockBalanceEntity, balance);
        }
    }
}
