import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import {
    MovimientoArticuloEntity,
    TipoMovimientoArticulo,
} from '../entities/movimiento-articulo.entity';
import { BalanceStockArticuloEntity } from '../entities/balance-stock-articulo.entity';

@EventSubscriber()
export class MovimientoArticuloSubscriber implements EntitySubscriberInterface<MovimientoArticuloEntity> {
    listenTo() {
        return MovimientoArticuloEntity;
    }

    async afterInsert(event: InsertEvent<MovimientoArticuloEntity>) {
        const mov = event.entity;
        if (!mov) return;
        const manager = event.manager;

        let multiplier = 0;
        switch (mov.tipo) {
            case TipoMovimientoArticulo.ENTRADA:
            case TipoMovimientoArticulo.AJUSTE_SUMA:
            case TipoMovimientoArticulo.ANULACION_SALIDA:
            case TipoMovimientoArticulo.ANULACION_AJUSTE_RESTA:
            case TipoMovimientoArticulo.ANULACION_SACADA_SEGUNDA:
            case TipoMovimientoArticulo.ANULACION_RECHAZO:
                multiplier = 1;
                break;
            case TipoMovimientoArticulo.SALIDA:
            case TipoMovimientoArticulo.AJUSTE_RESTA:
            case TipoMovimientoArticulo.SACADA_SEGUNDA:
            case TipoMovimientoArticulo.RECHAZO:
            case TipoMovimientoArticulo.ANULACION_ENTRADA:
            case TipoMovimientoArticulo.ANULACION_AJUSTE_SUMA:
                multiplier = -1;
                break;
        }

        if (multiplier === 0) return;

        const cantidadNum = Number(mov.cantidad);
        const deltaStock = cantidadNum * multiplier;
        const deposito = (mov.deposito || 'TERMINADO').trim().toUpperCase();

        // Bloqueo consultivo por artículo y depósito para garantizar consistencia concurrente
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            `stock_articulo:${deposito}`,
            mov.articuloId,
        ]);

        let balance = await manager.findOne(BalanceStockArticuloEntity, {
            where: {
                articuloId: mov.articuloId,
                deposito,
            },
            lock: { mode: 'pessimistic_write' },
        });

        if (balance) {
            const nextStock = Number(balance.stockActual) + deltaStock;
            if (nextStock < 0 && multiplier < 0) {
                throw new Error(
                    `Stock insuficiente para el artículo. Disponible en depósito ${deposito}: ${Number(balance.stockActual).toFixed(3)}, requerido: ${cantidadNum.toFixed(3)}.`,
                );
            }
            balance.stockActual = nextStock;

            // Actualizar acumuladores según tipo
            this.actualizarAcumuladores(balance, mov.tipo, cantidadNum);
            await manager.save(BalanceStockArticuloEntity, balance);
        } else {
            if (deltaStock < 0) {
                throw new Error(
                    `No existe stock previo para el artículo en el depósito ${deposito}. No es posible realizar una salida o rechazo.`,
                );
            }

            balance = manager.create(BalanceStockArticuloEntity, {
                articuloId: mov.articuloId,
                deposito,
                stockActual: deltaStock,
                totalEntradas: 0,
                totalSalidas: 0,
                totalSegunda: 0,
                totalRechazos: 0,
            });

            this.actualizarAcumuladores(balance, mov.tipo, cantidadNum);
            await manager.save(BalanceStockArticuloEntity, balance);
        }
    }

    private actualizarAcumuladores(
        balance: BalanceStockArticuloEntity,
        tipo: TipoMovimientoArticulo,
        cantidad: number,
    ) {
        switch (tipo) {
            case TipoMovimientoArticulo.ENTRADA:
                balance.totalEntradas = Number(balance.totalEntradas || 0) + cantidad;
                break;
            case TipoMovimientoArticulo.ANULACION_ENTRADA:
                balance.totalEntradas = Math.max(0, Number(balance.totalEntradas || 0) - cantidad);
                break;
            case TipoMovimientoArticulo.SALIDA:
                balance.totalSalidas = Number(balance.totalSalidas || 0) + cantidad;
                break;
            case TipoMovimientoArticulo.ANULACION_SALIDA:
                balance.totalSalidas = Math.max(0, Number(balance.totalSalidas || 0) - cantidad);
                break;
            case TipoMovimientoArticulo.SACADA_SEGUNDA:
                balance.totalSegunda = Number(balance.totalSegunda || 0) + cantidad;
                break;
            case TipoMovimientoArticulo.ANULACION_SACADA_SEGUNDA:
                balance.totalSegunda = Math.max(0, Number(balance.totalSegunda || 0) - cantidad);
                break;
            case TipoMovimientoArticulo.RECHAZO:
                balance.totalRechazos = Number(balance.totalRechazos || 0) + cantidad;
                break;
            case TipoMovimientoArticulo.ANULACION_RECHAZO:
                balance.totalRechazos = Math.max(0, Number(balance.totalRechazos || 0) - cantidad);
                break;
        }
    }
}
