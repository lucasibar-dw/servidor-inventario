import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import * as XLSX from 'xlsx';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';
import { ItemEntity, RotacionType } from 'src/modules/config/infrastructure/persistence/entities/item.entity';
import { PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { BatchEntity, BatchQualityStatus } from '../../infrastructure/persistence/entities/batch.entity';
import { MovimientosService } from './movimientos.service';
import { TipoMovimiento } from '../../infrastructure/persistence/entities/movimiento.entity';
import { DocumentoEntity, TipoDocumento, DocumentoStatus } from '../../infrastructure/persistence/entities/documento.entity';
import { SystemConfigService } from '../../../config/application/services/system-config.service';

@Injectable()
export class StockService {
    constructor(
        @InjectRepository(StockBalanceEntity)
        private readonly stockRepo: Repository<StockBalanceEntity>,
        @InjectRepository(ItemEntity)
        private readonly itemRepo: Repository<ItemEntity>,
        @InjectRepository(PositionEntity)
        private readonly positionRepo: Repository<PositionEntity>,
        @InjectRepository(BatchEntity)
        private readonly batchRepo: Repository<BatchEntity>,
        @InjectRepository(DocumentoEntity)
        private readonly docRepo: Repository<DocumentoEntity>,
        private readonly movimientosService: MovimientosService,
        private readonly systemConfigService: SystemConfigService,
        private readonly dataSource: DataSource,
    ) { }

    private isAllowed(user: any, depotId: string): boolean {
        if (!user || !user.role) return false;
        if (user.role.toUpperCase() === 'ADMIN') return true;
        const allowed = user.allowedDepotIds || [];
        return allowed.includes(depotId);
    }

    async findAll(filters: {
        depotId?: string;
        positionId?: string;
        supplierId?: string;
        itemId?: string;
        lotNumber?: string;
        categoria?: string;
        categoryId?: string;
        q?: string;
        limit?: number;
    }, user?: any): Promise<any[]> {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        let qb = this.stockRepo
            .createQueryBuilder('sb')
            .leftJoinAndSelect('sb.batch', 'batch')
            .leftJoinAndSelect('sb.posicion', 'pos')
            .leftJoinAndSelect('pos.depot', 'depot')
            .leftJoinAndSelect('batch.item', 'item')
            .leftJoinAndSelect('item.category', 'category')
            .leftJoinAndSelect('batch.supplier', 'supplier')
            .where('sb.qtyPrincipal > 0');

        if (filters.depotId) qb = qb.andWhere('sb.depositoId = :depotId', { depotId: filters.depotId });
        if (filters.positionId) qb = qb.andWhere('sb.posicionId = :positionId', { positionId: filters.positionId });
        if (filters.supplierId) qb = qb.andWhere('sb.supplierId = :supplierId', { supplierId: filters.supplierId });
        if (filters.itemId) qb = qb.andWhere('sb.itemId = :itemId', { itemId: filters.itemId });
        if (filters.categoria) qb = qb.andWhere('UPPER(pos.categoria) = UPPER(:categoria)', { categoria: filters.categoria });
        if (filters.categoryId) qb = qb.andWhere('item.categoryId = :categoryId', { categoryId: filters.categoryId });
        if (filters.lotNumber) qb = qb.andWhere('batch.lotNumber ILIKE :lot', { lot: `%${filters.lotNumber}%` });
        if (filters.q) {
            const tokens = filters.q.trim().split(/\s+/);
            tokens.forEach((token, index) => {
                qb = qb.andWhere(
                    `(item.descripcion ILIKE :q${index} OR item.codigoInterno ILIKE :q${index} OR category.nombre ILIKE :q${index} OR supplier.name ILIKE :q${index} OR pos.codigo ILIKE :q${index} OR batch.lotNumber ILIKE :q${index})`,
                    { [`q${index}`]: `%${token}%` }
                );
            });
        }

        if (!isAdmin && allowed.length > 0) {
            if (filters.depotId && !allowed.includes(filters.depotId)) {
                return [];
            }
            if (!filters.depotId) {
                qb = qb.andWhere('sb.depositoId IN (:...allowed)', { allowed });
            }
        } else if (user && !isAdmin && allowed.length === 0) {
            return [];
        }

        qb = qb.orderBy('pos.codigo', 'ASC').addOrderBy('item.descripcion', 'ASC');

        if (filters.limit) qb = qb.limit(filters.limit);

    return qb.getMany();
    }

    async exportStock(filters: any, user?: any): Promise<Buffer> {
        const data = await this.findAll({ ...filters, limit: undefined }, user);

        const rows = data.map(entry => ({
            'Código': entry.batch?.item?.codigoInterno || '',
            'Material': entry.batch?.item?.descripcion || '',
            'Categoría': entry.batch?.item?.category?.nombre || entry.batch?.item?.categoria || '',
            'Lote/Partida': entry.batch?.lotNumber || '',
            'Depósito': entry.posicion?.depot?.nombre || '',
            'Posición': entry.posicion?.codigo || '',
            'Kilos': Number(entry.qtyPrincipal || 0),
            'Unidades': Number(entry.qtySecundaria || 0),
            'Proveedor': entry.batch?.supplier?.name || '',
            'Obs. Partida': entry.batch?.observaciones || '',
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        
        // Auto-size columns (basic)
        const colWidths = [
            { wch: 15 }, // Código
            { wch: 40 }, // Material
            { wch: 20 }, // Categoría
            { wch: 15 }, // Lote
            { wch: 20 }, // Depósito
            { wch: 10 }, // Posición
            { wch: 12 }, // Kilos
            { wch: 12 }, // Unidades
            { wch: 25 }, // Proveedor
            { wch: 40 }, // Obs
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Stock');
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return buffer;
    }

    async getAlerts(user?: any, all: boolean = false): Promise<any[]> {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        const items = await this.itemRepo.find({ 
            where: { activo: true },
            relations: ['category']
        });

        const itemsWithMin = items.filter(i => i.stockMinimo !== null && i.stockMinimo !== undefined && Number(i.stockMinimo) >= 0);
        if (itemsWithMin.length === 0) return [];

        const itemIds = itemsWithMin.map(i => i.id);

        const whereCondition: any = { itemId: In(itemIds) };
        if (!isAdmin && allowed.length > 0) {
            whereCondition.depositoId = In(allowed);
        }

        const allBalances = await this.stockRepo.find({ where: whereCondition });

        const totalsByItem = new Map<string, number>();
        for (const b of allBalances) {
            totalsByItem.set(b.itemId, (totalsByItem.get(b.itemId) || 0) + Number(b.qtyPrincipal));
        }

        const alerts = [];
        for (const item of itemsWithMin) {
            const total = totalsByItem.get(item.id) || 0;
            const min = Number(item.stockMinimo);
            const isIgnored = Boolean(item.meta?.ignorarStockMinimo);
            const isUnderMin = total < min;
            const isNearMin = !isUnderMin && total <= min * 1.25;

            // If not all, return only active critical alerts (not ignored and below minimum)
            if (!all && (!isUnderMin || isIgnored)) {
                continue;
            }

            let status: 'RED' | 'YELLOW' | 'GREEN' = 'GREEN';
            if (isIgnored) {
                status = 'GREEN';
            } else if (isUnderMin) {
                status = 'RED';
            } else if (isNearMin) {
                status = 'YELLOW';
            }

            alerts.push({
                itemId: item.id,
                codigoInterno: item.codigoInterno,
                descripcion: item.descripcion,
                categoria: item.category?.nombre || (item as any).categoria || null,
                categoryId: item.categoryId || null,
                rotacion: item.rotacion,
                stockActual: total,
                stockMinimo: min,
                stockMaximo: item.stockMaximo !== null ? Number(item.stockMaximo) : null,
                deficit: min - total,
                depositoId: item.category?.depositoId || null,
                meta: item.meta || {},
                ignorarStockMinimo: isIgnored,
                status,
            });
        }
        return alerts;
    }

    async getDashboardCompras(user?: any): Promise<any[]> {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        const items = await this.itemRepo.find({
            where: [
                { rotacion: RotacionType.ALTA, activo: true },
                { rotacion: RotacionType.MEDIA, activo: true },
            ],
            relations: ['category']
        });

        if (items.length === 0) return [];

        const itemIds = items.map(i => i.id);

        const whereCondition: any = { itemId: In(itemIds) };
        if (!isAdmin && allowed.length > 0) {
            whereCondition.depositoId = In(allowed);
        }

        const allBalances = await this.stockRepo.find({ where: whereCondition });

        const totalsByItem = new Map<string, number>();
        for (const b of allBalances) {
            totalsByItem.set(b.itemId, (totalsByItem.get(b.itemId) || 0) + Number(b.qtyPrincipal));
        }

        const result = items.map(item => {
            const total = totalsByItem.get(item.id) || 0;
            return {
                itemId: item.id,
                codigoInterno: item.codigoInterno,
                descripcion: item.descripcion,
                categoria: item.category?.nombre || (item as any).categoria || null,
                rotacion: item.rotacion,
                stockActual: total,
                stockMinimo: item.stockMinimo,
                enAlerta: item.stockMinimo ? total < Number(item.stockMinimo) : false,
                depositoId: item.category?.depositoId || null,
            };
        });

        return result.sort((a, b) => a.descripcion.localeCompare(b.descripcion));
    }

    async adjust(dto: {
        depositoId: string;
        posicionId: string;
        itemId: string;
        lotId: string;
        qtyPrincipal: number;
        qtySecundaria?: number | null;
        fecha: string;
        user?: any;
        observaciones?: string | null;
    }): Promise<void> {
        if (!this.isAllowed(dto.user, dto.depositoId)) {
            throw new BadRequestException('No tienes permiso para operar en este depósito');
        }

        await this.dataSource.transaction(async (manager: EntityManager) => {
            const bal = await manager.findOne(StockBalanceEntity, {
                where: { depositoId: dto.depositoId, posicionId: dto.posicionId, itemId: dto.itemId, lotId: dto.lotId },
            });
            if (!bal) throw new NotFoundException('Registro de stock no encontrado');

            if (dto.qtyPrincipal < 0 && Number(bal.qtyPrincipal) + dto.qtyPrincipal < 0) {
                throw new BadRequestException('El ajuste dejaría cantidades principales negativas');
            }
            if (dto.qtySecundaria != null && dto.qtySecundaria < 0 && Number(bal.qtySecundaria ?? 0) + dto.qtySecundaria < 0) {
                throw new BadRequestException('El ajuste dejaría cantidades secundarias negativas');
            }

            let isSuma = true;
            if (dto.qtyPrincipal < 0) {
                isSuma = false;
            } else if (dto.qtyPrincipal === 0 && dto.qtySecundaria != null && dto.qtySecundaria < 0) {
                isSuma = false;
            }

            const tipo = isSuma ? TipoMovimiento.AJUSTE_SUMA : TipoMovimiento.AJUSTE_RESTA;

            await this.movimientosService.registrar({
                tipo,
                depositoId: dto.depositoId,
                posicionId: dto.posicionId,
                itemId: dto.itemId,
                lotId: dto.lotId,
                qtyPrincipal: Math.abs(dto.qtyPrincipal),
                qtySecundaria: dto.qtySecundaria != null ? Math.abs(dto.qtySecundaria) : null,
                fecha: dto.fecha,
                userId: dto.user?.sub || dto.user?.id || null,
                observaciones: dto.observaciones ?? null,
            }, manager);
        });
    }

    async move(dto: {
        depositoId: string;
        posicionIdOrigen: string;
        posicionIdDestino: string;
        itemId: string;
        lotId: string;
        qtyPrincipal: number;
        qtySecundaria?: number | null;
        fecha: string;
        user?: any;
    }): Promise<void> {
        return this.bulkMove({
            items: [dto],
            fecha: dto.fecha,
            user: dto.user,
            observaciones: `Transferencia interna de ${dto.posicionIdOrigen} a ${dto.posicionIdDestino}`
        });
    }

    async bulkMove(dto: {
        items: {
            depositoId: string;
            posicionIdOrigen: string;
            posicionIdDestino: string;
            itemId: string;
            lotId: string;
            qtyPrincipal: number;
            qtySecundaria?: number | null;
        }[];
        fecha: string;
        user?: any;
        observaciones?: string;
    }): Promise<void> {
        if (!dto.items.length) return;

        await this.dataSource.transaction(async (manager: EntityManager) => {
            const docNum = `BK-${Date.now().toString().slice(-6)}`;
            const documento = manager.create(DocumentoEntity, {
                tipo: TipoDocumento.MOV_INTERNO,
                numero: docNum,
                fecha: dto.fecha,
                depositoId: dto.items[0].depositoId,
                userId: dto.user?.sub || dto.user?.id || null,
                observaciones: dto.observaciones || 'Transferencia grupal de mercadería',
                status: DocumentoStatus.ACTIVO,
            });
            const savedDoc = await manager.save(DocumentoEntity, documento);

            for (const item of dto.items) {
                if (item.posicionIdOrigen === item.posicionIdDestino) continue;

                const origen = await manager.findOne(StockBalanceEntity, {
                    where: { posicionId: item.posicionIdOrigen, itemId: item.itemId, lotId: item.lotId },
                });
                if (!origen) throw new NotFoundException(`Balance de origen no encontrado para ítem ${item.itemId}`);

                if (!this.isAllowed(dto.user, origen.depositoId)) {
                    throw new BadRequestException(`Acceso denegado al depósito de origen ${origen.depositoId}`);
                }
                if (!this.isAllowed(dto.user, item.depositoId)) {
                    throw new BadRequestException(`Acceso denegado al depósito de destino ${item.depositoId}`);
                }

                if (Number(origen.qtyPrincipal) < item.qtyPrincipal)
                    throw new BadRequestException(`Stock insuficiente para ítem ${item.itemId}: disponible ${origen.qtyPrincipal}`);

                const baseMovimiento = {
                    itemId: item.itemId,
                    lotId: item.lotId,
                    supplierId: origen.supplierId,
                    qtyPrincipal: item.qtyPrincipal,
                    qtySecundaria: item.qtySecundaria ?? null,
                    fecha: dto.fecha,
                    userId: dto.user?.sub || dto.user?.id || null,
                    documentoId: savedDoc.id,
                    documentoNumero: savedDoc.numero,
                };

                await this.movimientosService.registrar({ 
                    ...baseMovimiento, 
                    depositoId: origen.depositoId, 
                    tipo: TipoMovimiento.AJUSTE_RESTA, 
                    posicionId: item.posicionIdOrigen, 
                    observaciones: 'Movimiento Interno (Salida)' 
                }, manager);

                await this.movimientosService.registrar({ 
                    ...baseMovimiento, 
                    depositoId: item.depositoId, 
                    tipo: TipoMovimiento.AJUSTE_SUMA, 
                    posicionId: item.posicionIdDestino, 
                    observaciones: 'Movimiento Interno (Entrada)' 
                }, manager);
            }
        });
    }

    async quickAdd(dto: {
        depositoId: string;
        posicionId: string;
        itemId: string;
        supplierId: string;
        lotNumber: string;
        qtyPrincipal: number;
        qtySecundaria?: number | null;
        fecha: string;
        user?: any;
    }): Promise<void> {
        if (dto.qtyPrincipal <= 0) throw new BadRequestException('La cantidad a agregar debe ser mayor a 0');
        if (!this.isAllowed(dto.user, dto.depositoId)) {
            throw new BadRequestException('Acceso denegado a este depósito');
        }

        const isQuarantine = await this.systemConfigService.isQuarantineEnabled();

        await this.dataSource.transaction(async (manager: EntityManager) => {
            let batch = await manager.findOne(BatchEntity, {
                where: { itemId: dto.itemId, supplierId: dto.supplierId, lotNumber: dto.lotNumber },
            });

            if (!batch) {
                batch = manager.create(BatchEntity, {
                    itemId: dto.itemId,
                    supplierId: dto.supplierId,
                    lotNumber: dto.lotNumber,
                    productionDate: null,
                    expirationDate: null,
                    qualityStatus: isQuarantine ? BatchQualityStatus.QUARANTINE : BatchQualityStatus.RELEASED,
                    qualityTestedAt: isQuarantine ? null : new Date(),
                    qualityTestedBy: isQuarantine ? null : 'Adición rápida (Cuarentena inactiva)',
                });
                await manager.save(batch);
            }

            await this.movimientosService.registrar({
                tipo: TipoMovimiento.AJUSTE_SUMA,
                depositoId: dto.depositoId,
                posicionId: dto.posicionId,
                itemId: dto.itemId,
                lotId: batch.id,
                qtyPrincipal: dto.qtyPrincipal,
                qtySecundaria: dto.qtySecundaria ?? null,
                fecha: dto.fecha,
                userId: dto.user?.sub || dto.user?.id || null,
                observaciones: 'Adición Rápida Manual',
            }, manager);
        });
    }

    async deleteBalance(dto: {
        depositoId: string;
        posicionId: string;
        itemId: string;
        lotId: string;
        fecha: string;
        user?: any;
        observaciones?: string | null;
    }): Promise<void> {
        if (!dto.depositoId || !dto.posicionId || !dto.itemId || !dto.lotId) {
            throw new BadRequestException('Faltan datos obligatorios para identificar el registro de stock (depositoId, posicionId, itemId, lotId)');
        }

        if (!this.isAllowed(dto.user, dto.depositoId)) {
            throw new BadRequestException('Acceso denegado a este depósito');
        }
        await this.dataSource.transaction(async (manager: EntityManager) => {
            const bal = await manager.findOne(StockBalanceEntity, {
                where: { depositoId: dto.depositoId, posicionId: dto.posicionId, itemId: dto.itemId, lotId: dto.lotId },
            });
            if (!bal) throw new NotFoundException('Registro de stock no encontrado');

            const qtyPrincipalEliminada = Number(bal.qtyPrincipal);
            const qtySecundariaEliminada = bal.qtySecundaria != null ? Number(bal.qtySecundaria) : null;

            await this.movimientosService.registrar({
                tipo: TipoMovimiento.AJUSTE_RESTA,
                depositoId: dto.depositoId,
                posicionId: dto.posicionId,
                itemId: dto.itemId,
                lotId: dto.lotId,
                qtyPrincipal: qtyPrincipalEliminada,
                qtySecundaria: qtySecundariaEliminada,
                fecha: dto.fecha,
                userId: dto.user?.sub || dto.user?.id || null,
                observaciones: dto.observaciones ?? 'Eliminación manual de registro',
            }, manager);
        });
    }

    async deleteAllStockForItem(dto: {
        itemId: string;
        fecha: string;
        user?: any;
        observaciones?: string | null;
    }): Promise<void> {
        if (dto.user?.role?.toUpperCase() !== 'ADMIN') {
            throw new BadRequestException('Solo los administradores pueden realizar borrados masivos de material');
        }
        await this.dataSource.transaction(async (manager: EntityManager) => {
            const balances = await manager.find(StockBalanceEntity, {
                where: { itemId: dto.itemId },
            });

            if (balances.length === 0) {
                return; // Nada que eliminar
            }

            for (const bal of balances) {
                await this.movimientosService.registrar({
                    tipo: TipoMovimiento.AJUSTE_RESTA,
                    depositoId: bal.depositoId,
                    posicionId: bal.posicionId,
                    itemId: bal.itemId,
                    lotId: bal.lotId,
                    qtyPrincipal: Number(bal.qtyPrincipal),
                    qtySecundaria: bal.qtySecundaria != null ? Number(bal.qtySecundaria) : null,
                    fecha: dto.fecha,
                    userId: dto.user?.sub || dto.user?.id || null,
                    observaciones: dto.observaciones || 'Eliminación masiva de stock por material',
                }, manager);
            }
        });
    }

    // ─── Reassign batch number (smart merge/create) ─────────────────────────────

    async reassignBatch(dto: {
        depositoId: string;
        posicionId: string;
        itemId: string;
        currentLotId: string;
        newLotNumber: string;
        fecha: string;
        user?: any;
    }): Promise<{ action: 'merged' | 'created'; batchId: string }> {
        if (!this.isAllowed(dto.user, dto.depositoId)) {
            throw new BadRequestException('Acceso denegado a este depósito');
        }

        return this.dataSource.transaction(async (manager: EntityManager) => {
            // 1. Find current stock balance
            const currentBalance = await manager.findOne(StockBalanceEntity, {
                where: { depositoId: dto.depositoId, posicionId: dto.posicionId, itemId: dto.itemId, lotId: dto.currentLotId },
                relations: ['batch'],
            });
            if (!currentBalance) throw new NotFoundException('Registro de stock no encontrado');

            const currentBatch = currentBalance.batch;
            const qty = Number(currentBalance.qtyPrincipal);
            const qtySec = currentBalance.qtySecundaria != null ? Number(currentBalance.qtySecundaria) : null;

            // 2. Check if a batch with the new lot number already exists for this item+supplier
            const existingBatch = await manager.findOne(BatchEntity, {
                where: {
                    itemId: dto.itemId,
                    lotNumber: dto.newLotNumber,
                    ...(currentBatch.supplierId ? { supplierId: currentBatch.supplierId } : {})
                },
            });

            let targetBatchId: string;
            let action: 'merged' | 'created';

            if (existingBatch && existingBatch.id !== dto.currentLotId) {
                // MERGE into existing batch
                targetBatchId = existingBatch.id;
                action = 'merged';
            } else if (!existingBatch) {
                // CREATE new batch
                const newBatch = manager.create(BatchEntity, {
                    itemId: dto.itemId,
                    supplierId: currentBatch.supplierId,
                    lotNumber: dto.newLotNumber,
                    expirationDate: currentBatch.expirationDate,
                    productionDate: currentBatch.productionDate,
                    qualityStatus: currentBatch.qualityStatus,
                    qualityTestedAt: currentBatch.qualityTestedAt,
                    qualityTestedBy: currentBatch.qualityTestedBy,
                    qualityNotes: currentBatch.qualityNotes,
                });
                const saved = await manager.save(BatchEntity, newBatch);
                targetBatchId = saved.id;
                action = 'created';
            } else {
                // Same batch, just rename it
                currentBatch.lotNumber = dto.newLotNumber;
                await manager.save(BatchEntity, currentBatch);
                return { action: 'created' as const, batchId: currentBatch.id };
            }

            // 3. Log adjustment OUT from old batch
            await this.movimientosService.registrar({
                tipo: TipoMovimiento.AJUSTE_RESTA,
                depositoId: dto.depositoId,
                posicionId: dto.posicionId,
                itemId: dto.itemId,
                lotId: dto.currentLotId,
                qtyPrincipal: qty,
                qtySecundaria: qtySec,
                fecha: dto.fecha,
                userId: dto.user?.sub || dto.user?.id || null,
                observaciones: `Reasignación de partida: ${currentBatch.lotNumber} → ${dto.newLotNumber}`,
            }, manager);

            // 4. Log adjustment IN to new batch
            await this.movimientosService.registrar({
                tipo: TipoMovimiento.AJUSTE_SUMA,
                depositoId: dto.depositoId,
                posicionId: dto.posicionId,
                itemId: dto.itemId,
                lotId: targetBatchId,
                qtyPrincipal: qty,
                qtySecundaria: qtySec,
                fecha: dto.fecha,
                userId: dto.user?.sub || dto.user?.id || null,
                observaciones: `Reasignación de partida: ${currentBatch.lotNumber} → ${dto.newLotNumber}`,
            }, manager);

            // 5. Cleanup: if old batch has zero total stock, remove it
            const remainingStock = await manager.find(StockBalanceEntity, {
                where: { lotId: dto.currentLotId },
            });
            const totalRemaining = remainingStock.reduce((s, b) => s + Number(b.qtyPrincipal), 0);
            if (totalRemaining <= 0) {
                await manager.delete(StockBalanceEntity, { lotId: dto.currentLotId });
                // Don't delete the batch entity itself — it's referenced by historical movements
            }

            return { action, batchId: targetBatchId };
        });
    }

    // ─── Check if batch exists ────────────────────────────────────────────────────

    async checkBatchExists(itemId: string, lotNumber: string, supplierId?: string): Promise<{ exists: boolean; batchId?: string }> {
        const where: any = { itemId, lotNumber };
        if (supplierId) where.supplierId = supplierId;
        const batch = await this.batchRepo.findOne({ where });
        return batch ? { exists: true, batchId: batch.id } : { exists: false };
    }

    async updateBatchObservations(id: string, observaciones: string | null): Promise<void> {
        const batch = await this.batchRepo.findOneBy({ id });
        if (!batch) throw new NotFoundException('Partida no encontrada');
        batch.observaciones = observaciones;
        await this.batchRepo.save(batch);
    }
}
