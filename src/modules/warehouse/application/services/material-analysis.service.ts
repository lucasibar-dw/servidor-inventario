import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemEntity } from '../../../config/infrastructure/persistence/entities/item.entity';
import { MovimientoEntity, MovimientoStatus } from '../../infrastructure/persistence/entities/movimiento.entity';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';

export enum MaterialReviewStatus {
    NORMAL = 'NORMAL',
    TO_REVIEW = 'TO_REVIEW',
    PRIORITIZE_EXIT = 'PRIORITIZE_EXIT',
    RESOLVED = 'RESOLVED',
}

@Injectable()
export class MaterialAnalysisService {
    constructor(
        @InjectRepository(ItemEntity)
        private readonly itemRepo: Repository<ItemEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockRepo: Repository<StockBalanceEntity>,
        @InjectRepository(MovimientoEntity)
        private readonly movementRepo: Repository<MovimientoEntity>,
    ) {}

    async getMaterialAnalysis(months = 6) {
        const safeMonths = Math.min(36, Math.max(1, Number(months) || 6));
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - safeMonths);
        const cutoffDate = cutoff.toISOString().slice(0, 10);

        const refs: { itemId: string; articuloId: string }[] = [];
        const reviews: any[] = [];
        const [items, stockRows, movementRows] = await Promise.all([
            this.itemRepo.find({ where: { activo: true }, relations: ['category'] }),
            this.stockRepo.createQueryBuilder('stock')
                .select('stock.itemId', 'itemId')
                .addSelect('SUM(stock.qtyPrincipal)', 'stockKg')
                .addSelect('SUM(COALESCE(stock.qtySecundaria, 0))', 'stockSecondary')
                .groupBy('stock.itemId')
                .getRawMany<{ itemId: string; stockKg: string; stockSecondary: string }>(),
            this.movementRepo.createQueryBuilder('movement')
                .select('movement.itemId', 'itemId')
                .addSelect('MAX(movement.fecha)', 'lastMovementDate')
                .addSelect('COUNT(*)', 'movementCount')
                .where('movement.status = :status', { status: MovimientoStatus.ACTIVO })
                .groupBy('movement.itemId')
                .getRawMany<{ itemId: string; lastMovementDate: string; movementCount: string }>(),
        ]);

        const linkedArticlesByItem = new Map<string, Set<string>>();
        refs.forEach((ref) => {
            const articles = linkedArticlesByItem.get(ref.itemId) ?? new Set<string>();
            articles.add(ref.articuloId);
            linkedArticlesByItem.set(ref.itemId, articles);
        });
        const stockByItem = new Map(stockRows.map((row) => [row.itemId, {
            kg: Number(row.stockKg ?? 0),
            secondary: Number(row.stockSecondary ?? 0),
        }]));
        const movementByItem = new Map(movementRows.map((row) => [row.itemId, row]));
        const reviewByItem = new Map(reviews.map((review) => [review.itemId, review]));

        const rows = items.map((item) => {
            const linkedArticles = linkedArticlesByItem.get(item.id)?.size ?? 0;
            const stock = stockByItem.get(item.id) ?? { kg: 0, secondary: 0 };
            const movement = movementByItem.get(item.id);
            const lastMovementDate = movement?.lastMovementDate ?? null;
            const noMovementForPeriod = stock.kg > 0 && (!lastMovementDate || lastMovementDate < cutoffDate);
            const review = reviewByItem.get(item.id);
            return {
                itemId: item.id,
                codigoInterno: item.codigoInterno,
                descripcion: item.descripcion,
                categoryId: item.categoryId,
                categoryName: item.category?.nombre ?? null,
                unidadPrincipal: item.unidadPrincipal,
                unidadSecundaria: item.unidadSecundaria,
                linkedArticles,
                hasArticleMatch: linkedArticles > 0,
                stockKg: stock.kg,
                stockSecondary: stock.secondary,
                lastMovementDate,
                movementCount: Number(movement?.movementCount ?? 0),
                stagnantMonths: lastMovementDate
                    ? Math.max(0, Math.floor((Date.now() - new Date(`${lastMovementDate}T00:00:00`).getTime()) / (30.4375 * 24 * 60 * 60 * 1000)))
                    : null,
                noMovementForPeriod,
                reviewStatus: review?.status ?? (noMovementForPeriod ? MaterialReviewStatus.TO_REVIEW : MaterialReviewStatus.NORMAL),
                reviewNotes: review?.notes ?? null,
                reviewedBy: review?.reviewedBy ?? null,
                reviewedAt: review?.reviewedAt ?? null,
            };
        });

        return {
            cutoffDate,
            months: safeMonths,
            summary: {
                totalActiveMaterials: rows.length,
                withoutArticleMatch: rows.filter((row) => !row.hasArticleMatch).length,
                stagnantWithStock: rows.filter((row) => row.noMovementForPeriod).length,
                prioritizeExit: rows.filter((row) => row.reviewStatus === MaterialReviewStatus.PRIORITIZE_EXIT).length,
            },
            withoutArticleMatch: rows.filter((row) => !row.hasArticleMatch)
                .sort((left, right) => right.stockKg - left.stockKg || left.descripcion.localeCompare(right.descripcion, 'es')),
            stagnant: rows.filter((row) => row.noMovementForPeriod)
                .sort((left, right) => Number(right.stagnantMonths ?? 999) - Number(left.stagnantMonths ?? 999)
                    || right.stockKg - left.stockKg),
        };
    }

    async updateReview(
        itemId: string,
        dto: { status: MaterialReviewStatus; notes?: string | null },
        reviewedBy?: string | null,
    ) {
        const item = await this.itemRepo.findOne({ where: { id: itemId, activo: true } });
        if (!item) throw new NotFoundException('Material no encontrado.');
        return {
            id: itemId,
            itemId,
            status: dto.status,
            notes: dto.notes ?? null,
            reviewedBy: reviewedBy ?? null,
            reviewedAt: new Date(),
        };
    }
}
