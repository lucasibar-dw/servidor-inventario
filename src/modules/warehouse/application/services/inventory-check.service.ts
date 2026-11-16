import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InventoryCheckEntity, InventoryCheckItemEntity } from '../../infrastructure/persistence/entities/inventory-check.entity';
import { PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';

@Injectable()
export class InventoryCheckService {
    constructor(
        @InjectRepository(InventoryCheckEntity) private readonly checkRepo: Repository<InventoryCheckEntity>,
        @InjectRepository(InventoryCheckItemEntity) private readonly itemRepo: Repository<InventoryCheckItemEntity>,
        @InjectRepository(PositionEntity) private readonly positionRepo: Repository<PositionEntity>,
        @InjectRepository(StockBalanceEntity) private readonly stockRepo: Repository<StockBalanceEntity>,
        private readonly dataSource: DataSource,
    ) {}

    private sortAlphanumeric(a: string, b: string): number {
        const regex = /[-]+/;
        const partsA = a.split(regex);
        const partsB = b.split(regex);

        for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
            const numA = parseInt(partsA[i], 10);
            const numB = parseInt(partsB[i], 10);

            if (!isNaN(numA) && !isNaN(numB)) {
                if (numA !== numB) {
                    return numA - numB;
                }
            } else {
                const cmp = partsA[i].localeCompare(partsB[i], undefined, { numeric: true, sensitivity: 'base' });
                if (cmp !== 0) return cmp;
            }
        }
        return partsA.length - partsB.length;
    }

    async create(depositoId: string, userId: string, categoryId?: string) {
        // 1. If there's an active in-progress check for this depot & category, auto-mark it as COMPLETADO before starting a new one
        const activeCheckQuery: any = { depositoId, status: 'EN_PROGRESO' };
        if (categoryId) {
            activeCheckQuery.categoryId = categoryId;
        } else {
            activeCheckQuery.categoryId = null;
        }

        const activeCheck = await this.checkRepo.findOne({
            where: activeCheckQuery
        });
        if (activeCheck) {
            activeCheck.status = 'COMPLETADO';
            activeCheck.completedAt = new Date();
            await this.checkRepo.save(activeCheck);
        }

        // 2. Query stock balances for this depot (and optionally filter by category)
        let stockQuery = this.stockRepo.createQueryBuilder('sb')
            .innerJoinAndSelect('sb.batch', 'batch')
            .innerJoinAndSelect('batch.item', 'item')
            .leftJoinAndSelect('item.category', 'category')
            .leftJoinAndSelect('batch.supplier', 'supplier')
            .innerJoinAndSelect('sb.posicion', 'pos')
            .where('sb.depositoId = :depositoId', { depositoId })
            .andWhere('sb.qtyPrincipal > 0');

        if (categoryId) {
            stockQuery = stockQuery.andWhere('item.categoryId = :categoryId', { categoryId });
        }

        const stocks = await stockQuery.getMany();

        // Group stocks by position
        const stockByPosition = new Map<string, { pos: PositionEntity; stocks: any[] }>();
        for (const stock of stocks) {
            if (!stock.posicion) continue;
            if (!stockByPosition.has(stock.posicionId)) {
                stockByPosition.set(stock.posicionId, { pos: stock.posicion, stocks: [] });
            }
            stockByPosition.get(stock.posicionId)!.stocks.push({
                itemId: stock.itemId,
                itemName: stock.batch?.item?.descripcion || null,
                itemCodigo: stock.batch?.item?.codigoInterno || null,
                categoryId: stock.batch?.item?.categoryId || null,
                categoryName: stock.batch?.item?.category?.nombre || null,
                lotNumber: stock.batch?.lotNumber || null,
                supplierName: stock.batch?.supplier?.name || null,
                unidadPrincipal: stock.batch?.item?.unidadPrincipal || 'kg',
                unidadSecundaria: stock.batch?.item?.unidadSecundaria || null,
                qtyPrincipal: stock.qtyPrincipal,
                qtySecundaria: stock.qtySecundaria,
            });
        }

        let positionsToCheck: { id: string; codigo: string; stocks: any[] }[] = [];

        if (categoryId) {
            // ONLY the positions that currently have stock of this category
            positionsToCheck = Array.from(stockByPosition.entries()).map(([posId, data]) => ({
                id: posId,
                codigo: data.pos.codigo,
                stocks: data.stocks,
            }));
        } else {
            // Full depot check: all active positions in the depot
            const positions = await this.positionRepo.find({
                where: { depositoId, activo: true }
            });
            positionsToCheck = positions.map(pos => ({
                id: pos.id,
                codigo: pos.codigo,
                stocks: stockByPosition.get(pos.id)?.stocks || []
            }));
        }

        // Sort positions alphanumeric
        positionsToCheck.sort((a, b) => this.sortAlphanumeric(a.codigo, b.codigo));

        // 3. Create Check and Items
        const check = this.checkRepo.create({
            depositoId,
            categoryId: categoryId || null,
            userId,
            status: 'EN_PROGRESO',
            items: positionsToCheck.map(pos => {
                return this.itemRepo.create({
                    posicionId: pos.id,
                    posicionCodigo: pos.codigo,
                    tag: 'PENDIENTE',
                    stockSnapshot: pos.stocks,
                });
            })
        });

        return await this.checkRepo.save(check);
    }

    async findAll(filters: { depositoId?: string; categoryId?: string; status?: string; desde?: string; hasta?: string }) {
        const query = this.checkRepo.createQueryBuilder('check')
            .leftJoinAndSelect('check.depot', 'depot')
            .leftJoinAndSelect('check.category', 'category');

        if (filters.depositoId) {
            query.andWhere('check.depositoId = :depositoId', { depositoId: filters.depositoId });
        }
        if (filters.categoryId) {
            query.andWhere('check.categoryId = :categoryId', { categoryId: filters.categoryId });
        }
        if (filters.status) {
            query.andWhere('check.status = :status', { status: filters.status });
        }
        if (filters.desde) {
            query.andWhere('check.startedAt >= :desde', { desde: filters.desde });
        }
        if (filters.hasta) {
            query.andWhere('check.startedAt <= :hasta', { hasta: filters.hasta });
        }

        query.orderBy('check.startedAt', 'DESC');
        return await query.getMany();
    }

    async findOne(id: string) {
        const check = await this.checkRepo.findOne({
            where: { id },
            relations: ['depot', 'category', 'items', 'items.posicion']
        });
        if (!check) throw new NotFoundException(`Check ${id} not found`);
        
        // Sort items by position codigo using the same logic
        check.items.sort((a, b) => this.sortAlphanumeric(a.posicionCodigo, b.posicionCodigo));

        // Return with depot aliased as deposito for frontend compatibility
        return {
            ...check,
            deposito: check.depot,
        };
    }

    async updateItem(checkId: string, itemId: string, data: {
        tag: string;
        observacion?: string | null;
        notaLibre?: string | null;
        realQtyPrincipal?: number | null;
        realQtySecundaria?: number | null;
    }) {
        const item = await this.itemRepo.findOne({ where: { id: itemId, checkId } });
        if (!item) throw new NotFoundException(`Item ${itemId} not found in check ${checkId}`);

        item.tag = data.tag as any;
        if (data.observacion !== undefined) item.observacion = data.observacion;
        if (data.notaLibre !== undefined) item.notaLibre = data.notaLibre;
        if (data.realQtyPrincipal !== undefined) item.realQtyPrincipal = data.realQtyPrincipal;
        if (data.realQtySecundaria !== undefined) item.realQtySecundaria = data.realQtySecundaria;
        item.checkedAt = new Date();

        return await this.itemRepo.save(item);
    }

    async complete(id: string) {
        const check = await this.checkRepo.findOne({ where: { id } });
        if (!check) throw new NotFoundException(`Check ${id} not found`);

        check.status = 'COMPLETADO';
        check.completedAt = new Date();

        return await this.checkRepo.save(check);
    }

    async getReport(id: string) {
        const check = await this.findOne(id);
        
        const total = check.items.length;
        const correcto = check.items.filter(i => i.tag === 'CORRECTO').length;
        const falta = check.items.filter(i => i.tag === 'FALTA').length;
        const sobra = check.items.filter(i => i.tag === 'SOBRA').length;
        const cantidadIncorrecta = check.items.filter(i => i.tag === 'CANTIDAD_INCORRECTA').length;
        const aChequear = check.items.filter(i => i.tag === 'A_CHEQUEAR').length;
        const incorrecta = check.items.filter(i => i.tag === 'POSICION_INCORRECTA').length;
        const pendiente = check.items.filter(i => i.tag === 'PENDIENTE').length;

        return {
            ...check,
            summary: {
                total,
                correcto,
                falta,
                sobra,
                cantidadIncorrecta,
                aChequear,
                incorrecta,
                pendiente,
            },
        };
    }

    async getDashboardAnalytics() {
        const checks = await this.checkRepo.find({
            relations: ['depot', 'items'],
            order: { startedAt: 'DESC' },
        });

        const totalChecks = checks.length;
        const completedChecks = checks.filter(c => c.status === 'COMPLETADO').length;

        // Calculate average duration in minutes for completed checks
        let totalDurationMs = 0;
        let completedWithDurationCount = 0;

        const checkSummaries = checks.map(c => {
            const total = c.items?.length || 0;
            const reviewed = c.items?.filter(i => i.tag !== 'PENDIENTE').length || 0;
            const correcto = c.items?.filter(i => i.tag === 'CORRECTO').length || 0;
            const aChequear = c.items?.filter(i => i.tag === 'A_CHEQUEAR').length || 0;
            const incorrecta = c.items?.filter(i => i.tag === 'POSICION_INCORRECTA').length || 0;
            const pendiente = total - reviewed;

            const accuracyPct = reviewed > 0 ? Math.round((correcto / reviewed) * 100) : 0;
            const completionPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

            let durationMinutes: number | null = null;
            if (c.startedAt && c.completedAt) {
                const start = new Date(c.startedAt).getTime();
                const end = new Date(c.completedAt).getTime();
                const diffMs = end - start;
                if (diffMs > 0) {
                    durationMinutes = Math.round(diffMs / 60000);
                    totalDurationMs += diffMs;
                    completedWithDurationCount++;
                }
            }

            return {
                id: c.id,
                depositoNombre: c.depot?.nombre || 'Depósito',
                status: c.status,
                startedAt: c.startedAt,
                completedAt: c.completedAt,
                durationMinutes,
                stats: {
                    total,
                    reviewed,
                    correcto,
                    aChequear,
                    incorrecta,
                    pendiente,
                    accuracyPct,
                    completionPct,
                }
            };
        });

        const avgDurationMinutes = completedWithDurationCount > 0
            ? Math.round((totalDurationMs / completedWithDurationCount) / 60000)
            : 0;

        const globalAccuracyPct = checkSummaries.length > 0
            ? Math.round(checkSummaries.reduce((acc, c) => acc + c.stats.accuracyPct, 0) / checkSummaries.length)
            : 0;

        const globalCompletionPct = checkSummaries.length > 0
            ? Math.round(checkSummaries.reduce((acc, c) => acc + c.stats.completionPct, 0) / checkSummaries.length)
            : 0;

        // Top recurring issue types across all checks
        const issueBreakdown: Record<string, number> = {};
        checks.forEach(c => {
            c.items?.forEach(item => {
                if (item.observacion) {
                    issueBreakdown[item.observacion] = (issueBreakdown[item.observacion] || 0) + 1;
                }
            });
        });

        return {
            summaryMetrics: {
                totalChecks,
                completedChecks,
                avgDurationMinutes,
                globalAccuracyPct,
                globalCompletionPct,
                lastCheckAt: checks[0]?.startedAt || null,
            },
            issueBreakdown,
            history: checkSummaries,
        };
    }
}

