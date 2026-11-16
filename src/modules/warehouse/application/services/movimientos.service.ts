import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource, IsNull, In } from 'typeorm';
import { MovimientoEntity, TipoMovimiento, MovimientoStatus } from '../../infrastructure/persistence/entities/movimiento.entity';
import { DocumentoEntity, DocumentoStatus } from '../../infrastructure/persistence/entities/documento.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';
import { PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { ItemEntity } from '../../../config/infrastructure/persistence/entities/item.entity';
import { BatchEntity } from '../../infrastructure/persistence/entities/batch.entity';

export interface RegistrarMovimientoDto {
    tipo: TipoMovimiento;
    posicionId: string;
    itemId: string;
    lotId?: string | null;
    qtyPrincipal: number;
    qtySecundaria?: number | null;
    documentoId?: string | null;
    documentoNumero?: string | null;
    fecha: string;
    userId?: string | null;
    observaciones?: string | null;
    depositoId?: string; // Keep optional for backwards compatibility in DTOS
    supplierId?: string | null; // Keep optional for backwards compatibility in DTOS
}

@Injectable()
export class MovimientosService {
    constructor(
        @InjectRepository(MovimientoEntity)
        private readonly movimientoRepo: Repository<MovimientoEntity>,
        private readonly dataSource: DataSource,
    ) { }

    /**
     * Registra un movimiento dentro de una transacción propia o de la ya existente.
     */
    async registrar(dto: RegistrarMovimientoDto, manager?: EntityManager): Promise<MovimientoEntity> {
        if (!manager) return this.dataSource.transaction((transactionManager) => this.registrar(dto, transactionManager));
        if (!dto.posicionId || !dto.itemId) throw new BadRequestException('El movimiento requiere posición e ítem.');
        if (!Number.isFinite(Number(dto.qtyPrincipal)) || Number(dto.qtyPrincipal) < 0) {
            throw new BadRequestException('La cantidad principal del movimiento debe ser un número mayor o igual a cero.');
        }
        if (dto.qtySecundaria != null && (!Number.isFinite(Number(dto.qtySecundaria)) || Number(dto.qtySecundaria) < 0)) {
            throw new BadRequestException('La cantidad secundaria del movimiento debe ser un número mayor o igual a cero.');
        }

        const position = await manager.findOne(PositionEntity, { where: { id: dto.posicionId, activo: true } });
        if (!position) throw new BadRequestException('La posición indicada no existe o está inactiva.');
        if (dto.depositoId && position.depositoId !== dto.depositoId) {
            throw new BadRequestException('La posición no pertenece al depósito indicado.');
        }

        // El advisory lock también cubre el caso donde todavía no existe una fila de balance.
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            `stock:${dto.posicionId}`,
            `${dto.itemId}:${dto.lotId ?? 'SIN_LOTE'}`,
        ]);

        if (this.reducesStock(dto.tipo)) {
            const balance = await manager.findOne(StockBalanceEntity, {
                where: {
                    depositoId: position.depositoId,
                    posicionId: dto.posicionId,
                    itemId: dto.itemId,
                    lotId: dto.lotId ?? IsNull(),
                },
                lock: { mode: 'pessimistic_write' },
            });
            const availablePrincipal = Number(balance?.qtyPrincipal ?? 0);
            const availableSecondary = Number(balance?.qtySecundaria ?? 0);
            if (availablePrincipal < Number(dto.qtyPrincipal)) {
                if (dto.tipo === TipoMovimiento.ANULACION_ENTRADA) {
                    const item = await manager.findOne(ItemEntity, { where: { id: dto.itemId } });
                    const batch = dto.lotId ? await manager.findOne(BatchEntity, { where: { id: dto.lotId } }) : null;
                    const itemDesc = item?.descripcion || item?.codigoInterno || 'Material';
                    const loteInfo = batch?.lotNumber ? ` (Lote: ${batch.lotNumber})` : '';
                    const posCode = position.codigo || 'ENTRADA';
                    throw new BadRequestException(
                        `No se puede anular el remito de entrada: el material "${itemDesc}"${loteInfo} ya no se encuentra en la posición "${posCode}" (disponible: ${availablePrincipal.toFixed(2)}, necesario: ${Number(dto.qtyPrincipal).toFixed(2)}). Si ya fue reubicado o trasladado, debe volver a la posición de ingreso para poder anular el remito.`
                    );
                }
                throw new BadRequestException(`Stock insuficiente. Disponible: ${availablePrincipal.toFixed(3)}.`);
            }
            if (dto.qtySecundaria != null && availableSecondary < Number(dto.qtySecundaria)) {
                if (dto.tipo === TipoMovimiento.ANULACION_ENTRADA) {
                    const item = await manager.findOne(ItemEntity, { where: { id: dto.itemId } });
                    const batch = dto.lotId ? await manager.findOne(BatchEntity, { where: { id: dto.lotId } }) : null;
                    const itemDesc = item?.descripcion || item?.codigoInterno || 'Material';
                    const loteInfo = batch?.lotNumber ? ` (Lote: ${batch.lotNumber})` : '';
                    const posCode = position.codigo || 'ENTRADA';
                    throw new BadRequestException(
                        `No se puede anular el remito de entrada: el material "${itemDesc}"${loteInfo} no cuenta con cantidad secundaria suficiente en la posición "${posCode}" (disponible: ${availableSecondary.toFixed(2)}, necesario: ${Number(dto.qtySecundaria).toFixed(2)}).`
                    );
                }
                throw new BadRequestException(`Stock secundario insuficiente. Disponible: ${availableSecondary.toFixed(3)}.`);
            }
        }

        const repo = manager.getRepository(MovimientoEntity);

        const mov = repo.create({
            tipo: dto.tipo,
            posicionId: dto.posicionId,
            itemId: dto.itemId,
            lotId: dto.lotId ?? null,
            qtyPrincipal: dto.qtyPrincipal,
            qtySecundaria: dto.qtySecundaria ?? null,
            documentoId: dto.documentoId ?? null,
            documentoNumero: dto.documentoNumero ?? null,
            fecha: dto.fecha,
            userId: dto.userId ?? null,
            observaciones: dto.observaciones ?? null,
            status: MovimientoStatus.ACTIVO,
        });

        return repo.save(mov);
    }

    private reducesStock(tipo: TipoMovimiento): boolean {
        return [
            TipoMovimiento.REMITO_SALIDA,
            TipoMovimiento.AJUSTE_RESTA,
            TipoMovimiento.ANULACION_ENTRADA,
            TipoMovimiento.ANULACION_AJUSTE_SUMA,
            TipoMovimiento.ENTREGA_PRODUCCION,
            TipoMovimiento.ANULACION_DEVOLUCION_LINEA,
            TipoMovimiento.ANULACION_INGRESO_PRODUCCION,
        ].includes(tipo);
    }

    async findAll(filters: {
        depositoId?: string;
        itemId?: string;
        lotNumber?: string;
        tipo?: TipoMovimiento;
        desde?: string;
        hasta?: string;
        limit?: number;
    }): Promise<MovimientoEntity[]> {
        let qb = this.movimientoRepo
            .createQueryBuilder('m')
            .leftJoinAndSelect('m.item', 'item')
            .leftJoinAndSelect('item.supplier', 'supplier')
            .leftJoinAndSelect('item.category', 'category')
            .leftJoinAndSelect('m.batch', 'batch')
            .leftJoinAndSelect('batch.supplier', 'batchSupplier')
            .leftJoinAndSelect('m.posicion', 'posicion')
            .leftJoinAndSelect('posicion.depot', 'deposito')
            .leftJoinAndSelect('m.user', 'user')
            .leftJoinAndSelect('m.documento', 'documento')
            .leftJoinAndSelect('documento.partner', 'partner')
            .orderBy('m.fecha', 'DESC')
            .addOrderBy('m.createdAt', 'DESC');

        if (filters.depositoId) qb = qb.andWhere('posicion.depositoId = :depositoId', { depositoId: filters.depositoId });
        if (filters.itemId) qb = qb.andWhere('m.itemId = :itemId', { itemId: filters.itemId });
        if (filters.lotNumber) qb = qb.andWhere('batch.lotNumber LIKE :lotNumber', { lotNumber: `%${filters.lotNumber}%` });
        if (filters.tipo) qb = qb.andWhere('m.tipo = :tipo', { tipo: filters.tipo });
        if (filters.desde) qb = qb.andWhere('m.fecha >= :desde', { desde: filters.desde });
        if (filters.hasta) qb = qb.andWhere('m.fecha <= :hasta', { hasta: filters.hasta });
        if (filters.limit) qb = qb.limit(filters.limit);

        return qb.getMany();
    }

    async cancelar(movimientoId: string, manager?: EntityManager): Promise<MovimientoEntity> {
        if (!manager) {
            return this.dataSource.transaction((transactionManager) => this.cancelar(movimientoId, transactionManager));
        }
        const repo = manager.getRepository(MovimientoEntity);

        // PostgreSQL no permite FOR UPDATE sobre el lado nullable de un LEFT JOIN.
        // Bloquear solo el movimiento; registrar resuelve y valida su posición.
        const original = await repo.findOne({
            where: { id: movimientoId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!original) throw new NotFoundException(`Movimiento ${movimientoId} no encontrado`);
        if (original.status === MovimientoStatus.ANULADO) throw new BadRequestException('El movimiento ya está anulado');
        const tipoAnulacion = this.getTipoAnulacion(original.tipo);

        // 1. Marcar original como ANULADO (Audit trail)
        original.status = MovimientoStatus.ANULADO;
        await repo.save(original);

        // 2. Crear movimiento de compensación (mismos datos pero tipo ANULACION)
        const compMov = await this.registrar({
            tipo: tipoAnulacion,
            posicionId: original.posicionId,
            itemId: original.itemId,
            lotId: original.lotId,
            qtyPrincipal: original.qtyPrincipal, // El subscriber usará el multiplicador -1 según el tipo
            qtySecundaria: original.qtySecundaria,
            documentoId: original.documentoId,
            documentoNumero: original.documentoNumero,
            fecha: new Date().toISOString().split('T')[0], // Fecha de hoy para la anulación
            userId: original.userId,
            observaciones: `Anulación de movimiento ${original.id}. ${original.observaciones ?? ''}`,
        }, manager);

        // 3. Si el movimiento pertenece a un remito/documento, verificar si quedan movimientos activos
        if (original.documentoId) {
            const docRepo = manager.getRepository(DocumentoEntity);
            const activeCount = await repo.count({
                where: {
                    documentoId: original.documentoId,
                    status: MovimientoStatus.ACTIVO,
                    tipo: In([
                        TipoMovimiento.REMITO_ENTRADA, TipoMovimiento.REMITO_SALIDA,
                        TipoMovimiento.AJUSTE_SUMA, TipoMovimiento.AJUSTE_RESTA,
                        TipoMovimiento.MOVE_INTERNO, TipoMovimiento.ENTREGA_PRODUCCION,
                        TipoMovimiento.DEVOLUCION_LINEA, TipoMovimiento.INGRESO_PRODUCCION,
                    ]),
                }
            });
            if (activeCount === 0) {
                await docRepo.update(original.documentoId, { status: DocumentoStatus.ANULADO });
            }
        }

        return compMov;
    }

    private getTipoAnulacion(tipo: TipoMovimiento): TipoMovimiento {
        switch (tipo) {
            case TipoMovimiento.REMITO_ENTRADA: return TipoMovimiento.ANULACION_ENTRADA;
            case TipoMovimiento.REMITO_SALIDA: return TipoMovimiento.ANULACION_SALIDA;
            case TipoMovimiento.AJUSTE_SUMA: return TipoMovimiento.ANULACION_AJUSTE_SUMA;
            case TipoMovimiento.AJUSTE_RESTA: return TipoMovimiento.ANULACION_AJUSTE_RESTA;
            case TipoMovimiento.ENTREGA_PRODUCCION:
            case TipoMovimiento.INGRESO_PRODUCCION:
            case TipoMovimiento.DEVOLUCION_LINEA:
                throw new BadRequestException('Este movimiento está vinculado a Producción y no admite anulación directa desde Auditoría de stock: requiere corregir también sus registros de origen.');
            default:
                throw new BadRequestException(`El movimiento ${tipo} no admite anulación directa.`);
        }
    }
}
