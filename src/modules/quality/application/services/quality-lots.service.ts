import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchEntity, BatchQualityStatus } from '../../../warehouse/infrastructure/persistence/entities/batch.entity';
import { StockBalanceEntity } from '../../../warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { SystemConfigService } from '../../../config/application/services/system-config.service';

@Injectable()
export class QualityLotsService {
    constructor(
        @InjectRepository(BatchEntity)
        private readonly batchRepo: Repository<BatchEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockRepo: Repository<StockBalanceEntity>,
        private readonly systemConfigService: SystemConfigService,
    ) {}

    async findAll(filters: {
        page?: number;
        pageSize?: number;
        status?: BatchQualityStatus;
        q?: string;
        depositoId?: string;
    }, user?: any) {
        const page = Math.max(1, Number(filters.page) || 1);
        const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize) || 25));
        const query = this.batchRepo.createQueryBuilder('batch')
            .leftJoinAndSelect('batch.item', 'item')
            .leftJoinAndSelect('batch.supplier', 'supplier')
            .where('EXISTS (SELECT 1 FROM stock_balance stock WHERE stock."lotId" = batch.id AND stock."qtyPrincipal" > 0)')
            .orderBy('batch.createdAt', 'DESC')
            .addOrderBy('batch.lotNumber', 'DESC');
        if (filters.status) query.andWhere('batch.qualityStatus = :status', { status: filters.status });
        if (filters.q?.trim()) {
            query.andWhere('(batch.lotNumber ILIKE :q OR item.codigoInterno ILIKE :q OR item.descripcion ILIKE :q OR supplier.name ILIKE :q)', { q: `%${filters.q.trim()}%` });
        }
        if (filters.depositoId) {
            query.andWhere('EXISTS (SELECT 1 FROM stock_balance depot_stock WHERE depot_stock."lotId" = batch.id AND depot_stock."depositoId" = :depositoId AND depot_stock."qtyPrincipal" > 0)', { depositoId: filters.depositoId });
        }
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowedDepotIds: string[] = user?.allowedDepotIds ?? [];
        if (!isAdmin) {
            if (allowedDepotIds.length === 0) return { data: [], total: 0, page, pageSize, totalPages: 1, summary: { quarantine: 0, released: 0, total: 0 } };
            query.andWhere('EXISTS (SELECT 1 FROM stock_balance allowed_stock WHERE allowed_stock."lotId" = batch.id AND allowed_stock."depositoId" IN (:...allowedDepotIds) AND allowed_stock."qtyPrincipal" > 0)', { allowedDepotIds });
        }
        const [batches, total] = await query.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
        const ids = batches.map((batch) => batch.id);
        const balances = ids.length ? await this.stockRepo.createQueryBuilder('stock')
            .leftJoinAndSelect('stock.posicion', 'position')
            .leftJoinAndSelect('position.depot', 'depot')
            .where('stock.lotId IN (:...ids)', { ids })
            .andWhere('stock.qtyPrincipal > 0')
            .getMany() : [];
        const byBatch = new Map<string, StockBalanceEntity[]>();
        balances.forEach((balance) => byBatch.set(balance.lotId!, [...(byBatch.get(balance.lotId!) ?? []), balance]));

        const scope = this.batchRepo.createQueryBuilder('batch')
            .select('batch.qualityStatus', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('EXISTS (SELECT 1 FROM stock_balance stock WHERE stock."lotId" = batch.id AND stock."qtyPrincipal" > 0)')
            .groupBy('batch.qualityStatus');
        if (!isAdmin && allowedDepotIds.length) {
            scope.andWhere('EXISTS (SELECT 1 FROM stock_balance allowed_stock WHERE allowed_stock."lotId" = batch.id AND allowed_stock."depositoId" IN (:...allowedDepotIds) AND allowed_stock."qtyPrincipal" > 0)', { allowedDepotIds });
        }
        if (filters.depositoId) scope.andWhere('EXISTS (SELECT 1 FROM stock_balance depot_stock WHERE depot_stock."lotId" = batch.id AND depot_stock."depositoId" = :depositoId AND depot_stock."qtyPrincipal" > 0)', { depositoId: filters.depositoId });
        const counts = await scope.getRawMany<{ status: BatchQualityStatus; count: string }>();
        const countMap = new Map(counts.map((row) => [row.status, Number(row.count)]));

        return {
            data: batches.map((batch) => {
                const stock = byBatch.get(batch.id) ?? [];
                return {
                    ...batch,
                    totalQtyPrincipal: stock.reduce((sum, balance) => sum + Number(balance.qtyPrincipal), 0),
                    locations: stock.map((balance) => ({
                        depositoId: balance.depositoId,
                        deposito: balance.posicion?.depot?.nombre ?? null,
                        posicion: balance.posicion?.codigo ?? null,
                        qtyPrincipal: Number(balance.qtyPrincipal),
                    })),
                };
            }),
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            summary: {
                quarantine: countMap.get(BatchQualityStatus.QUARANTINE) ?? 0,
                released: countMap.get(BatchQualityStatus.RELEASED) ?? 0,
                total: [...countMap.values()].reduce((sum, count) => sum + count, 0),
            },
        };
    }

    async release(id: string, userLabel: string, notes?: string | null) {
        const batch = await this.batchRepo.findOne({ where: { id }, relations: ['item', 'supplier'] });
        if (!batch) throw new NotFoundException('Lote no encontrado.');
        if (batch.qualityStatus === BatchQualityStatus.RELEASED) {
            throw new BadRequestException('El lote ya está liberado.');
        }
        batch.qualityStatus = BatchQualityStatus.RELEASED;
        batch.qualityTestedAt = new Date();
        batch.qualityTestedBy = userLabel;
        batch.qualityNotes = notes?.trim() || null;
        return this.batchRepo.save(batch);
    }

    async getConfig() {
        const quarantineEnabled = await this.systemConfigService.isQuarantineEnabled();
        return { quarantineEnabled };
    }

    async setConfig(enabled: boolean) {
        const quarantineEnabled = await this.systemConfigService.setQuarantineEnabled(enabled);
        return { quarantineEnabled };
    }

    async releaseAll(userLabel: string) {
        const result = await this.batchRepo.createQueryBuilder()
            .update(BatchEntity)
            .set({
                qualityStatus: BatchQualityStatus.RELEASED,
                qualityTestedAt: new Date(),
                qualityTestedBy: userLabel,
                qualityNotes: 'Aprobación masiva de cuarentena',
            })
            .where('qualityStatus = :status', { status: BatchQualityStatus.QUARANTINE })
            .execute();

        return { releasedCount: result.affected || 0 };
    }
}
