import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { ComboCompraEntity } from '../../infrastructure/persistence/entities/combo-compra.entity';
import { StockBalanceEntity } from 'src/modules/warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { ItemEntity } from 'src/modules/config/infrastructure/persistence/entities/item.entity';
import { MovimientoEntity, TipoMovimiento, MovimientoStatus } from 'src/modules/warehouse/infrastructure/persistence/entities/movimiento.entity';

@Injectable()
export class CombosCompraService {
    constructor(
        @InjectRepository(ComboCompraEntity)
        private readonly comboRepo: Repository<ComboCompraEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockRepo: Repository<StockBalanceEntity>,
        @InjectRepository(ItemEntity)
        private readonly itemRepo: Repository<ItemEntity>,
        @InjectRepository(MovimientoEntity)
        private readonly movimientoRepo: Repository<MovimientoEntity>,
    ) { }

    async create(dto: { title: string; supplierId?: string | null; itemIds: string[]; depositoId?: string | null; stockMinimo?: number | null; stockMaximo?: number | null }): Promise<ComboCompraEntity> {
        const combo = this.comboRepo.create({
            ...dto,
            isActive: true,
        });
        return this.comboRepo.save(combo);
    }

    async findAll(user?: any, depositoId?: string): Promise<any[]> {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        const where: any = { isActive: true };
        if (depositoId) {
            where.depositoId = depositoId;
        }

        const combos = await this.comboRepo.find({
            where,
            relations: ['supplier'],
            order: { title: 'ASC' },
        });

        const filteredCombos = isAdmin
            ? combos
            : combos.filter(c => !c.depositoId || allowed.includes(c.depositoId));

        const result = [];
        for (const combo of filteredCombos) {
            let totalStock = 0;
            let totalSecondaryStock = 0;
            let totalMinStock = Number(combo.stockMinimo || 0);
            let unitLabel = '';
            let secondaryUnitLabel = '';
            let daysOfSupply: number | null = null;
            let totalConsumed30Days = 0;

            if (combo.itemIds && combo.itemIds.length > 0) {
                const balances = await this.stockRepo.find({
                    where: { itemId: In(combo.itemIds) }
                });
                totalStock = balances.reduce((sum, b) => sum + Number(b.qtyPrincipal), 0);
                totalSecondaryStock = balances.reduce((sum, b) => sum + Number(b.qtySecundaria || 0), 0);

                const items = await this.itemRepo.find({
                    where: { id: In(combo.itemIds) }
                });

                if (items.length > 0) {
                    unitLabel = items[0].unidadPrincipal;
                    secondaryUnitLabel = items[0].unidadSecundaria || '';
                }

                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const consumos = await this.movimientoRepo.find({
                    where: {
                        itemId: In(combo.itemIds),
                        tipo: TipoMovimiento.REMITO_SALIDA,
                        status: MovimientoStatus.ACTIVO,
                        createdAt: MoreThanOrEqual(thirtyDaysAgo)
                    }
                });

                totalConsumed30Days = consumos.reduce((sum, mov) => sum + Number(mov.qtyPrincipal), 0);
                const avgDailyConsumption = totalConsumed30Days / 30;

                daysOfSupply = avgDailyConsumption > 0 ? totalStock / avgDailyConsumption : null;
            }

            result.push({
                ...combo,
                totalStock,
                totalSecondaryStock,
                totalMinStock,
                unitLabel,
                secondaryUnitLabel,
                deficit: Math.max(0, totalMinStock - totalStock),
                daysOfSupply,
                totalConsumed30Days,
                pendingStock: 0,
                incomingDate: null,
            });
        }
        return result;
    }

    async getBreakdown(id: string): Promise<any> {
        const combo = await this.comboRepo.findOne({
            where: { id },
            relations: ['supplier'],
        });
        if (!combo) throw new NotFoundException('Combo no encontrado');

        if (!combo.itemIds || combo.itemIds.length === 0) return [];

        const balances = await this.stockRepo.find({
            where: { itemId: In(combo.itemIds) },
            relations: ['batch', 'batch.item', 'posicion', 'posicion.depot'],
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const consumos = await this.movimientoRepo.find({
            where: {
                itemId: In(combo.itemIds),
                tipo: TipoMovimiento.REMITO_SALIDA,
                status: MovimientoStatus.ACTIVO,
                createdAt: MoreThanOrEqual(thirtyDaysAgo)
            }
        });

        const grouped = balances.reduce((acc, b) => {
            const itemId = b.itemId;
            if (!acc[itemId]) {
                acc[itemId] = {
                    itemId: itemId,
                    description: b.batch?.item?.descripcion || 'Material',
                    code: b.batch?.item?.codigoInterno || 'N/A',
                    total: 0,
                    totalSecondary: 0,
                    unitLabel: b.batch?.item?.unidadPrincipal || 'kg',
                    secondaryUnitLabel: b.batch?.item?.unidadSecundaria || '',
                    avgDailyConsumption: 0,
                    daysOfSupply: null as number | null,
                    incomingStock: 0 as number,
                    incomingDate: null as string | null,
                    batches: [],
                };
            }
            acc[itemId].total += Number(b.qtyPrincipal);
            acc[itemId].totalSecondary += Number(b.qtySecundaria || 0);

            if (!acc[itemId].batchesGrouped) acc[itemId].batchesGrouped = {};
            const lot = b.batch?.lotNumber || 'SIN PARTIDA';
            if (!acc[itemId].batchesGrouped[lot]) {
                acc[itemId].batchesGrouped[lot] = {
                    lotNumber: lot,
                    qty: 0,
                    qtySecondary: 0,
                    positions: [],
                };
            }
            acc[itemId].batchesGrouped[lot].qty += Number(b.qtyPrincipal);
            acc[itemId].batchesGrouped[lot].qtySecondary += Number(b.qtySecundaria || 0);
            acc[itemId].batchesGrouped[lot].positions.push({
                depot: b.posicion?.depot?.nombre || 'N/A',
                position: b.posicion?.codigo || 'N/A',
                qty: Number(b.qtyPrincipal),
            });

            return acc;
        }, {} as Record<string, any>);

        for (const itemId of Object.keys(grouped)) {
            grouped[itemId].batches = Object.values(grouped[itemId].batchesGrouped);
            delete grouped[itemId].batchesGrouped;

            const itemConsumos = consumos.filter(c => c.itemId === itemId);
            const totalConsumed30d = itemConsumos.reduce((sum, c) => sum + Number(c.qtyPrincipal), 0);
            const avgDaily = totalConsumed30d / 30;

            grouped[itemId].avgDailyConsumption = avgDaily;
            grouped[itemId].daysOfSupply = avgDaily > 0 ? grouped[itemId].total / avgDaily : null;
            grouped[itemId].pendingStock = 0;
            grouped[itemId].incomingDate = null;
        }

        return Object.values(grouped);
    }

    async update(id: string, dto: { title?: string; itemIds?: string[]; depositoId?: string | null; stockMinimo?: number | null; stockMaximo?: number | null }): Promise<ComboCompraEntity> {
        const combo = await this.comboRepo.findOne({ where: { id } });
        if (!combo) throw new NotFoundException('Combo no encontrado');
        if (dto.title) combo.title = dto.title;
        if (dto.itemIds) combo.itemIds = dto.itemIds;
        if (dto.depositoId !== undefined) combo.depositoId = dto.depositoId;
        if (dto.stockMinimo !== undefined) combo.stockMinimo = dto.stockMinimo;
        if (dto.stockMaximo !== undefined) combo.stockMaximo = dto.stockMaximo;
        return this.comboRepo.save(combo);
    }

    async delete(id: string): Promise<void> {
        await this.comboRepo.update(id, { isActive: false });
    }
}
