import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface CockpitQuery {
    tipoCambio?: number;
    depositoId?: string;
    categoryId?: string;
}

@Injectable()
export class FinanceService {
    constructor(private readonly dataSource: DataSource) {}

    async getCockpit(query: CockpitQuery) {
        const tipoCambio = Number(query.tipoCambio) > 0 ? Number(query.tipoCambio) : 1250;
        const now = new Date();

        const params: any[] = [];
        let whereClauses = ' WHERE sb."qtyPrincipal" > 0 ';

        if (query.depositoId) {
            params.push(query.depositoId);
            whereClauses += ` AND sb."depositoId" = $${params.length} `;
        }

        if (query.categoryId) {
            params.push(query.categoryId);
            whereClauses += ` AND i."categoryId" = $${params.length} `;
        }

        const rawSql = `
            SELECT 
                sb.id as "balanceId",
                sb."depositoId",
                COALESCE(d.nombre, 'Sin Depósito') as "depositoNombre",
                sb."itemId",
                i."codigoInterno",
                i.descripcion as "itemDescripcion",
                COALESCE(i.rotacion, 'MEDIA') as "rotacion",
                COALESCE(i."unidadPrincipal", 'KG') as "unidadPrincipal",
                COALESCE(i."costoUnitario", (i.meta->>'costoUnitario')::numeric, 0)::numeric as "costoUnitario",
                i."categoryId",
                COALESCE(c.nombre, 'SIN CATEGORIA') as "categoryNombre",
                sb."qtyPrincipal"::numeric as "qtyPrincipal",
                b.id as "batchId",
                b."lotNumber",
                b."createdAt" as "batchCreatedAt"
            FROM stock_balance sb
            JOIN items i ON i.id = sb."itemId"
            LEFT JOIN item_categories c ON c.id = i."categoryId"
            LEFT JOIN depots d ON d.id = sb."depositoId"
            LEFT JOIN batches b ON b.id = sb."lotId"
            ${whereClauses}
        `;

        const rows: any[] = await this.dataSource.query(rawSql, params);

        let totalValuationUsd = 0;
        let totalKilos = 0;
        const itemsMap = new Map<string, any>();
        const categoryMap = new Map<string, any>();
        const depotMap = new Map<string, any>();

        // Aging buckets (User rules: < 3 meses verde, 3-6 meses alerta amarilla, > 6 meses estancado critico)
        const aging = {
            circulante: { label: 'Capital Circulante (< 3 meses)', days: '0 - 90 días', color: '#10b981', usd: 0, ars: 0, kilos: 0, items: new Set<string>() },
            alertaAmarilla: { label: 'Alerta Amarilla (3 a 6 meses)', days: '91 - 180 días', color: '#f59e0b', usd: 0, ars: 0, kilos: 0, items: new Set<string>() },
            estancadoCritico: { label: 'Estancado Crítico (> 6 meses)', days: '+180 días', color: '#ef4444', usd: 0, ars: 0, kilos: 0, items: new Set<string>() },
        };

        // Rotación buckets
        const rotacionMap: Record<string, { usd: 0; ars: 0; kilos: 0; count: 0 }> = {
            ALTA: { usd: 0, ars: 0, kilos: 0, count: 0 },
            MEDIA: { usd: 0, ars: 0, kilos: 0, count: 0 },
            BAJA: { usd: 0, ars: 0, kilos: 0, count: 0 },
            TEMPORAL: { usd: 0, ars: 0, kilos: 0, count: 0 },
        };

        for (const r of rows) {
            const qty = Number(r.qtyPrincipal) || 0;
            const cost = Number(r.costoUnitario) || 0;
            const valUsd = qty * cost;
            const valArs = valUsd * tipoCambio;

            totalValuationUsd += valUsd;
            totalKilos += qty;

            // Batch aging calculation
            const batchDate = r.batchCreatedAt ? new Date(r.batchCreatedAt) : now;
            const diffDays = Math.max(0, Math.floor((now.getTime() - batchDate.getTime()) / (1000 * 60 * 60 * 24)));

            let statusAging: 'CIRCULANTE' | 'ALERTA_AMARILLA' | 'ESTANCADO_CRITICO' = 'CIRCULANTE';
            if (diffDays > 180) {
                statusAging = 'ESTANCADO_CRITICO';
                aging.estancadoCritico.usd += valUsd;
                aging.estancadoCritico.kilos += qty;
                aging.estancadoCritico.items.add(r.itemId);
            } else if (diffDays > 90) {
                statusAging = 'ALERTA_AMARILLA';
                aging.alertaAmarilla.usd += valUsd;
                aging.alertaAmarilla.kilos += qty;
                aging.alertaAmarilla.items.add(r.itemId);
            } else {
                aging.circulante.usd += valUsd;
                aging.circulante.kilos += qty;
                aging.circulante.items.add(r.itemId);
            }

            // Rotación grouping
            const rotKey = (r.rotacion || 'MEDIA').toUpperCase();
            if (!rotacionMap[rotKey]) {
                rotacionMap[rotKey] = { usd: 0, ars: 0, kilos: 0, count: 0 };
            }
            rotacionMap[rotKey].usd += valUsd as any;
            rotacionMap[rotKey].kilos += qty as any;
            rotacionMap[rotKey].count++;

            // Category grouping
            const catName = r.categoryNombre || 'SIN CATEGORIA';
            if (!categoryMap.has(catName)) {
                categoryMap.set(catName, {
                    categoryId: r.categoryId,
                    categoria: catName,
                    kilos: 0,
                    valuationUsd: 0,
                    valuationArs: 0,
                    itemsCount: new Set<string>(),
                    costedItemsCount: new Set<string>(),
                });
            }
            const catObj = categoryMap.get(catName);
            catObj.kilos += qty;
            catObj.valuationUsd += valUsd;
            catObj.itemsCount.add(r.itemId);
            if (cost > 0) catObj.costedItemsCount.add(r.itemId);

            // Depot grouping
            const depName = r.depositoNombre || 'Sin Depósito';
            if (!depotMap.has(depName)) {
                depotMap.set(depName, {
                    depositoId: r.depositoId,
                    deposito: depName,
                    kilos: 0,
                    valuationUsd: 0,
                    valuationArs: 0,
                });
            }
            const depObj = depotMap.get(depName);
            depObj.kilos += qty;
            depObj.valuationUsd += valUsd;

            // Item Pareto aggregation
            if (!itemsMap.has(r.itemId)) {
                itemsMap.set(r.itemId, {
                    itemId: r.itemId,
                    codigoInterno: r.codigoInterno,
                    descripcion: r.itemDescripcion,
                    categoria: catName,
                    rotacion: r.rotacion,
                    unidad: r.unidadPrincipal,
                    costoUnitarioUsd: cost,
                    stockQty: 0,
                    valuationUsd: 0,
                    maxDaysInStock: 0,
                    statusAging: 'CIRCULANTE',
                });
            }
            const itObj = itemsMap.get(r.itemId);
            itObj.stockQty += qty;
            itObj.valuationUsd += valUsd;
            if (diffDays > itObj.maxDaysInStock) {
                itObj.maxDaysInStock = diffDays;
                itObj.statusAging = statusAging;
            }
        }

        // Summary calculations
        const totalItemsCount = itemsMap.size;
        let costedItemsCount = 0;
        for (const item of itemsMap.values()) {
            if (item.costoUnitarioUsd > 0) costedItemsCount++;
        }
        const coberturaCosteoPct = totalItemsCount > 0 ? Math.round((costedItemsCount / totalItemsCount) * 100) : 0;

        // Finish aging ARS and percentages
        const finishAgingBucket = (b: any) => ({
            label: b.label,
            days: b.days,
            color: b.color,
            usd: Math.round(b.usd * 100) / 100,
            ars: Math.round(b.usd * tipoCambio),
            kilos: Math.round(b.kilos * 100) / 100,
            itemsCount: b.items.size,
            pctOfValuation: totalValuationUsd > 0 ? Number(((b.usd / totalValuationUsd) * 100).toFixed(1)) : 0,
            pctOfKilos: totalKilos > 0 ? Number(((b.kilos / totalKilos) * 100).toFixed(1)) : 0,
        });

        // Finish categories
        const categories = Array.from(categoryMap.values()).map((c) => ({
            categoryId: c.categoryId,
            categoria: c.categoria,
            kilos: Math.round(c.kilos * 100) / 100,
            valuationUsd: Math.round(c.valuationUsd * 100) / 100,
            valuationArs: Math.round(c.valuationUsd * tipoCambio),
            totalItems: c.itemsCount.size,
            costedItems: c.costedItemsCount.size,
            pctOfTotalValuation: totalValuationUsd > 0 ? Number(((c.valuationUsd / totalValuationUsd) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.valuationUsd - a.valuationUsd);

        // Finish depots
        const depots = Array.from(depotMap.values()).map((d) => ({
            depositoId: d.depositoId,
            deposito: d.deposito,
            kilos: Math.round(d.kilos * 100) / 100,
            valuationUsd: Math.round(d.valuationUsd * 100) / 100,
            valuationArs: Math.round(d.valuationUsd * tipoCambio),
            pctOfTotalValuation: totalValuationUsd > 0 ? Number(((d.valuationUsd / totalValuationUsd) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.valuationUsd - a.valuationUsd);

        // Finish rotacion
        const rotacion = Object.entries(rotacionMap).map(([key, val]) => ({
            rotacion: key,
            usd: Math.round(val.usd * 100) / 100,
            ars: Math.round(val.usd * tipoCambio),
            kilos: Math.round(val.kilos * 100) / 100,
            pctOfValuation: totalValuationUsd > 0 ? Number(((val.usd / totalValuationUsd) * 100).toFixed(1)) : 0,
        }));

        // Top 15 Pareto Inmovilizado
        const topPareto = Array.from(itemsMap.values())
            .map((it) => ({
                ...it,
                stockQty: Math.round(it.stockQty * 100) / 100,
                costoUnitarioUsd: Math.round(it.costoUnitarioUsd * 100) / 100,
                valuationUsd: Math.round(it.valuationUsd * 100) / 100,
                valuationArs: Math.round(it.valuationUsd * tipoCambio),
                pctOfTotalValuation: totalValuationUsd > 0 ? Number(((it.valuationUsd / totalValuationUsd) * 100).toFixed(2)) : 0,
            }))
            .sort((a, b) => b.valuationUsd - a.valuationUsd)
            .slice(0, 15);

        return {
            summary: {
                tipoCambio,
                totalValuationUsd: Math.round(totalValuationUsd * 100) / 100,
                totalValuationArs: Math.round(totalValuationUsd * tipoCambio),
                totalKilos: Math.round(totalKilos * 100) / 100,
                totalItemsCount,
                costedItemsCount,
                coberturaCosteoPct,
                capitalCriticoUsd: Math.round(aging.estancadoCritico.usd * 100) / 100,
                capitalCriticoArs: Math.round(aging.estancadoCritico.usd * tipoCambio),
                capitalAlertaUsd: Math.round(aging.alertaAmarilla.usd * 100) / 100,
                capitalCirculanteUsd: Math.round(aging.circulante.usd * 100) / 100,
            },
            aging: {
                circulante: finishAgingBucket(aging.circulante),
                alertaAmarilla: finishAgingBucket(aging.alertaAmarilla),
                estancadoCritico: finishAgingBucket(aging.estancadoCritico),
            },
            rotacion,
            categories,
            depots,
            topPareto,
        };
    }

    async getCategoriesCostSummary() {
        const sql = `
            SELECT 
                c.id as "categoryId",
                c.nombre as "categoria",
                COUNT(DISTINCT i.id)::int as "totalItems",
                COUNT(DISTINCT CASE WHEN i."costoUnitario" > 0 OR (i.meta->>'costoUnitario')::numeric > 0 THEN i.id END)::int as "itemsCosteados",
                ROUND(AVG(COALESCE(i."costoUnitario", (i.meta->>'costoUnitario')::numeric, 0))::numeric, 2) as "costoPromedioUsd",
                COALESCE(ROUND(SUM(sb."qtyPrincipal")::numeric, 2), 0) as "stockTotal",
                COALESCE(ROUND(SUM(sb."qtyPrincipal" * COALESCE(i."costoUnitario", (i.meta->>'costoUnitario')::numeric, 0))::numeric, 2), 0) as "valorTotalUsd"
            FROM item_categories c
            LEFT JOIN items i ON i."categoryId" = c.id
            LEFT JOIN stock_balance sb ON sb."itemId" = i.id AND sb."qtyPrincipal" > 0
            GROUP BY c.id, c.nombre
            ORDER BY "totalItems" DESC
        `;
        const rows = await this.dataSource.query(sql);
        return rows.map((r: any) => ({
            categoryId: r.categoryId,
            categoria: r.categoria,
            totalItems: Number(r.totalItems) || 0,
            itemsCosteados: Number(r.itemsCosteados) || 0,
            costoPromedioUsd: Number(r.costoPromedioUsd) || 0,
            stockTotal: Number(r.stockTotal) || 0,
            valorTotalUsd: Number(r.valorTotalUsd) || 0,
        }));
    }
}
