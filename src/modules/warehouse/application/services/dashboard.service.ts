import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepotEntity, PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';
import { MovimientoEntity, TipoMovimiento } from '../../infrastructure/persistence/entities/movimiento.entity';

@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(DepotEntity)
        private readonly depotRepo: Repository<DepotEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockRepo: Repository<StockBalanceEntity>,
        @InjectRepository(MovimientoEntity)
        private readonly movRepo: Repository<MovimientoEntity>,
    ) {}

    async getCapacityByDepot(user?: any) {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        const depots = await this.depotRepo.find({
            relations: ['positions'],
        });

        const finalDepots = isAdmin 
            ? depots 
            : depots.filter(d => allowed.includes(d.id));

        const stock = await this.stockRepo.find({
            relations: ['posicion', 'batch', 'batch.item', 'batch.item.boxType'],
        });

        const results = finalDepots.map(depot => {
            const categoriesMap: Record<string, { totalCapacity: number; occupiedVolume: number }> = {};

            // Initialize categories from positions
            depot.positions?.forEach(pos => {
                if (!pos.activo) return;
                
                // Get all category restrictions
                const cats: string[] = [];
                if (pos.categoriaPrincipal) cats.push(pos.categoriaPrincipal);
                if (pos.categoriaSecundaria) cats.push(pos.categoriaSecundaria);

                // If no special categories, default to 'stock'
                const finalCats = cats.length > 0 ? cats : ['stock'];

                finalCats.forEach((cat: string) => {
                    if (!categoriesMap[cat]) {
                        categoriesMap[cat] = { totalCapacity: 0, occupiedVolume: 0 };
                    }
                    categoriesMap[cat].totalCapacity += Number(pos.metrosCubicos || 0);
                });
            });

            // Aggregate occupied volume from stock
            stock.forEach(sb => {
                if (sb.depositoId !== depot.id || !sb.posicion) return;
                
                const pos = sb.posicion;
                const cats: string[] = [];
                if (pos.categoriaPrincipal) cats.push(pos.categoriaPrincipal);
                if (pos.categoriaSecundaria) cats.push(pos.categoriaSecundaria);
                
                const finalCats = cats.length > 0 ? cats : ['stock'];

                finalCats.forEach((cat: string) => {
                    if (!categoriesMap[cat]) return;

                    const qtyPrincipal = Number(sb.qtyPrincipal || 0);
                    const kilosPorCaja = Number(sb.batch?.item?.kilosPorCaja || 0);
                    const boxes = sb.qtySecundaria !== null 
                        ? Number(sb.qtySecundaria) 
                        : (kilosPorCaja > 0 ? qtyPrincipal / kilosPorCaja : 0);

                    const unitVolume = Number(sb.batch?.item?.boxType?.volumenM3 || 0);
                    // Note: We attribute the volume to each category the position belongs to for dashboard overview
                    categoriesMap[cat].occupiedVolume += boxes * unitVolume;
                });
            });

            const categories = Object.entries(categoriesMap).map(([name, data]) => ({
                name,
                totalCapacity: data.totalCapacity,
                occupiedVolume: data.occupiedVolume,
                percentage: data.totalCapacity > 0 
                    ? (data.occupiedVolume / data.totalCapacity) * 100 
                    : 0,
            }));

            return {
                depotId: depot.id,
                depotNombre: depot.nombre,
                planta: depot.planta,
                categories,
            };
        });

        return results;
    }

    async getVolumes(user?: any) {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        const stock = await this.stockRepo.find({
            relations: ['batch', 'batch.item'],
        });

        const finalStock = isAdmin 
            ? stock 
            : stock.filter(sb => allowed.includes(sb.depositoId));

        const itemsMap = new Map<string, {
            itemId: string;
            codigoInterno: string;
            descripcion: string;
            currentKilos: number;
            currentBoxes: number;
            kilosPorCaja: number | null;
            stockMaximo: number | null;
        }>();

        finalStock.forEach(sb => {
            if (!sb.batch?.item) return;
            const item = sb.batch.item;
            const kilos = Number(sb.qtyPrincipal || 0);
            const kilosPorCaja = item.kilosPorCaja ? Number(item.kilosPorCaja) : 0;
            const boxes = sb.qtySecundaria !== null 
                ? Number(sb.qtySecundaria) 
                : (kilosPorCaja > 0 ? kilos / kilosPorCaja : 0);

            if (!itemsMap.has(item.id)) {
                itemsMap.set(item.id, {
                    itemId: item.id,
                    codigoInterno: item.codigoInterno,
                    descripcion: item.descripcion,
                    currentKilos: 0,
                    currentBoxes: 0,
                    kilosPorCaja: item.kilosPorCaja !== null ? Number(item.kilosPorCaja) : null,
                    stockMaximo: item.stockMaximo !== null ? Number(item.stockMaximo) : null,
                });
            }
            const mapItem = itemsMap.get(item.id)!;
            mapItem.currentKilos += kilos;
            mapItem.currentBoxes += boxes;
        });

        // Convert to array
        return Array.from(itemsMap.values()).map(data => {
            const maxBoxes = data.kilosPorCaja && data.kilosPorCaja > 0 && data.stockMaximo
                ? data.stockMaximo / data.kilosPorCaja
                : 0;
            
            return {
                ...data,
                maxBoxes,
                isOverStock: data.stockMaximo && data.currentKilos > data.stockMaximo,
            };
        });
    }

    async getCapacityTimeline(user?: any) {
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowed = user?.allowedDepotIds || [];

        // 1. Calculate Current Volume from Stock
        const stock = await this.stockRepo.find({
            relations: ['batch', 'batch.item', 'batch.item.boxType'],
        });

        const finalStock = isAdmin 
            ? stock 
            : stock.filter(sb => allowed.includes(sb.depositoId));

        let currentVolume = 0;
        finalStock.forEach(sb => {
            const qtyPrincipal = Number(sb.qtyPrincipal || 0);
            const kilosPorCaja = Number(sb.batch?.item?.kilosPorCaja || 0);
            const boxes = sb.qtySecundaria !== null 
                ? Number(sb.qtySecundaria) 
                : (kilosPorCaja > 0 ? qtyPrincipal / kilosPorCaja : 0);
            
            const volumenM3 = Number(sb.batch?.item?.boxType?.volumenM3 || 0);
            
            if (volumenM3 > 0) {
                currentVolume += boxes * volumenM3;
            }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0); // normalize to start of day

        // Generate 30 days past and 30 days future timeline array
        const timeline: Record<string, { date: string; volume: number; type: 'historical' | 'today' | 'projected' }> = {};
        
        for (let i = -30; i <= 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            timeline[dateStr] = {
                date: dateStr,
                volume: 0,
                type: i < 0 ? 'historical' : (i === 0 ? 'today' : 'projected')
            };
        }

        timeline[today.toISOString().split('T')[0]].volume = currentVolume;

        // 2. Fetch movements for the last 30 days to calculate historical volume
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const qb = this.movRepo.createQueryBuilder('mov')
            .leftJoinAndSelect('mov.item', 'item')
            .leftJoinAndSelect('item.boxType', 'boxType')
            .leftJoin('mov.posicion', 'posicion')
            .where('mov.fecha >= :startDate', { startDate: thirtyDaysAgo.toISOString().split('T')[0] })
            .andWhere('mov.fecha <= :endDate', { endDate: today.toISOString().split('T')[0] });

        if (!isAdmin && allowed.length > 0) {
            qb.andWhere('posicion.depositoId IN (:...allowed)', { allowed });
        }

        const movimientos = await qb.getMany();

        // Calculate daily net volume variations
        const dailyNetVolume: Record<string, number> = {};
        let totalOutboundVolumeLast30Days = 0;

        movimientos.forEach(mov => {
            if (mov.status === 'ANULADO') return;
            // Ignoramos movimientos internos
            if (mov.tipo === TipoMovimiento.MOVE_INTERNO) return;

            const qtyPrincipal = Number(mov.qtyPrincipal || 0);
            const kilosPorCaja = Number(mov.item?.kilosPorCaja || 0);
            const boxes = mov.qtySecundaria !== null 
                ? Number(mov.qtySecundaria) 
                : (kilosPorCaja > 0 ? qtyPrincipal / kilosPorCaja : 0);

            const volumenM3 = Number(mov.item?.boxType?.volumenM3 || 0);

            if (volumenM3 > 0) {
                const movVolume = boxes * volumenM3;
                
                // Determine if it's an addition or subtraction to the total stock
                let isAddition = false;
                let isSubtraction = false;

                if ([TipoMovimiento.REMITO_ENTRADA, TipoMovimiento.AJUSTE_SUMA, TipoMovimiento.ANULACION_SALIDA, TipoMovimiento.ANULACION_AJUSTE_RESTA, TipoMovimiento.ANULACION_ENTREGA_PRODUCCION, TipoMovimiento.DEVOLUCION_LINEA, TipoMovimiento.INGRESO_PRODUCCION].includes(mov.tipo)) {
                    isAddition = true;
                } else if ([TipoMovimiento.REMITO_SALIDA, TipoMovimiento.AJUSTE_RESTA, TipoMovimiento.ANULACION_ENTRADA, TipoMovimiento.ANULACION_AJUSTE_SUMA, TipoMovimiento.ENTREGA_PRODUCCION, TipoMovimiento.ANULACION_DEVOLUCION_LINEA, TipoMovimiento.ANULACION_INGRESO_PRODUCCION].includes(mov.tipo)) {
                    isSubtraction = true;
                    totalOutboundVolumeLast30Days += movVolume; // track outbound for average consumption
                }

                const dateStr = mov.fecha;
                if (!dailyNetVolume[dateStr]) dailyNetVolume[dateStr] = 0;

                if (isAddition) dailyNetVolume[dateStr] += movVolume;
                if (isSubtraction) dailyNetVolume[dateStr] -= movVolume;
            }
        });

        // 3. Reconstruct the past (Volume(Day-1) = Volume(Day) - NetMovement(Day))
        let runningVolume = currentVolume;
        for (let i = 0; i >= -30; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            
            if (i < 0) {
                // If I am at day -1, its volume is day 0 volume minus day 0 net movements
                const nextDay = new Date(d);
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDayStr = nextDay.toISOString().split('T')[0];
                const netMovNextDay = dailyNetVolume[nextDayStr] || 0;
                
                runningVolume = runningVolume - netMovNextDay;
                timeline[dateStr].volume = Math.max(0, runningVolume); // avoid negative anomalies
            }
        }

        // 4. Calculate Average Daily Consumption
        const avgDailyConsumption = totalOutboundVolumeLast30Days / 30;

        // 5. Project the future
        runningVolume = currentVolume;
        for (let i = 1; i <= 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];

            runningVolume = runningVolume - avgDailyConsumption;
            timeline[dateStr].volume = Math.max(0, runningVolume);
        }

        // Return sorted array
        return Object.values(timeline).sort((a, b) => a.date.localeCompare(b.date));
    }
}
