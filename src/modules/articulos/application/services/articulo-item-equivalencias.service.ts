import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ArticuloItemEquivalenciaEntity } from '../../infrastructure/persistence/entities/articulo-item-equivalencia.entity';
import { ArticuloEntity } from '../../infrastructure/persistence/entities/articulo.entity';
import { ItemEntity } from '../../../config/infrastructure/persistence/entities/item.entity';
import { StockBalanceEntity } from '../../../warehouse/infrastructure/persistence/entities/stock-balance.entity';

export interface AsociarItemDto {
    articuloId: string;
    itemId: string;
    ordenPrioridad?: number;
    factorConversion?: number;
    observaciones?: string;
}

export interface MaestroEquivalenciasFilterDto {
    search?: string;
    tipo?: string;
    etapa?: string;
    soloSinMapear?: boolean;
    soloMapeados?: boolean;
    page?: number;
    limit?: number;
}

@Injectable()
export class ArticuloItemEquivalenciasService {
    constructor(
        @InjectRepository(ArticuloItemEquivalenciaEntity)
        private readonly equivalenciaRepo: Repository<ArticuloItemEquivalenciaEntity>,
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
        @InjectRepository(ItemEntity)
        private readonly itemRepo: Repository<ItemEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockBalanceRepo: Repository<StockBalanceEntity>,
        private readonly dataSource: DataSource,
    ) { }

    private static tablaVerificada = false;

    async asegurarTabla(): Promise<void> {
        if (ArticuloItemEquivalenciasService.tablaVerificada) return;

        await this.dataSource.query(`
            CREATE TABLE IF NOT EXISTS "articulo_item_equivalencias" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "articuloId" uuid NOT NULL,
                "codigoArticulo" character varying(50) NOT NULL,
                "itemId" uuid NOT NULL,
                "codigoItem" character varying(50) NOT NULL,
                "ordenPrioridad" integer NOT NULL DEFAULT 1,
                "esPrincipal" boolean NOT NULL DEFAULT false,
                "factorConversion" numeric(10,4) NOT NULL DEFAULT 1.0,
                "observaciones" text,
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_articulo_item_equivalencias_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_articulo_item_equivalencias_articulo" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_articulo_item_equivalencias_item" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_articulo_item_equivalencias_articulo_item" UNIQUE ("articuloId", "itemId")
            );

            CREATE INDEX IF NOT EXISTS "IDX_equiv_articulo_orden" ON "articulo_item_equivalencias" ("articuloId", "ordenPrioridad");
            CREATE INDEX IF NOT EXISTS "IDX_equiv_cod_articulo" ON "articulo_item_equivalencias" ("codigoArticulo");
            CREATE INDEX IF NOT EXISTS "IDX_equiv_cod_item" ON "articulo_item_equivalencias" ("codigoItem");
        `);

        ArticuloItemEquivalenciasService.tablaVerificada = true;
    }

    /**
     * Obtiene todos los ítems asociados a un artículo, ordenados por prioridad de consumo
     * e incluye el stock físico actual en depósito para cada ítem.
     */
    async findByArticulo(articuloId: string): Promise<any[]> {
        await this.asegurarTabla();

        const equivalencias = await this.equivalenciaRepo.find({
            where: { articuloId, activo: true },
            relations: ['item', 'item.supplier', 'item.category'],
            order: { ordenPrioridad: 'ASC' },
        });

        if (equivalencias.length === 0) return [];

        const itemIds = equivalencias.map((e) => e.itemId);

        // Obtener stock actual consolidado por ítem
        const balances = await this.stockBalanceRepo
            .createQueryBuilder('sb')
            .select('sb.itemId', 'itemId')
            .addSelect('SUM(sb.qtyPrincipal)', 'stockTotal')
            .where('sb.itemId IN (:...itemIds)', { itemIds })
            .groupBy('sb.itemId')
            .getRawMany();

        const stockMap = new Map<string, number>();
        balances.forEach((b) => {
            stockMap.set(b.itemId, Number(b.stockTotal || 0));
        });

        return equivalencias.map((e) => ({
            id: e.id,
            articuloId: e.articuloId,
            codigoArticulo: e.codigoArticulo,
            itemId: e.itemId,
            codigoItem: e.codigoItem,
            ordenPrioridad: e.ordenPrioridad,
            esPrincipal: e.esPrincipal,
            factorConversion: Number(e.factorConversion),
            observaciones: e.observaciones,
            item: {
                id: e.item?.id,
                codigoInterno: e.item?.codigoInterno,
                descripcion: e.item?.descripcion,
                unidadPrincipal: e.item?.unidadPrincipal,
                supplierName: e.item?.supplier?.name,
                categoria: e.item?.category?.nombre,
            },
            stockActual: stockMap.get(e.itemId) || 0,
        }));
    }

    /**
     * Asocia un ítem de inventario a un artículo con prioridad y factor de conversión.
     */
    async asociarItem(dto: AsociarItemDto): Promise<ArticuloItemEquivalenciaEntity> {
        await this.asegurarTabla();

        const articulo = await this.articuloRepo.findOne({ where: { id: dto.articuloId } });
        if (!articulo) {
            throw new NotFoundException(`Artículo no encontrado.`);
        }

        const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
        if (!item) {
            throw new NotFoundException(`Ítem de inventario no encontrado.`);
        }

        const existing = await this.equivalenciaRepo.findOne({
            where: { articuloId: dto.articuloId, itemId: dto.itemId },
        });

        if (existing) {
            throw new BadRequestException(`El ítem "${item.codigoInterno}" ya se encuentra vinculado a este artículo.`);
        }

        // Obtener equivalencias actuales para calcular prioridad
        const actuales = await this.equivalenciaRepo.find({
            where: { articuloId: dto.articuloId },
            order: { ordenPrioridad: 'ASC' },
        });

        let nuevaPrioridad = dto.ordenPrioridad || actuales.length + 1;
        if (nuevaPrioridad < 1) nuevaPrioridad = 1;

        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(ArticuloItemEquivalenciaEntity);

            // Si se inserta en una prioridad ya existente, desplazar las demás
            for (const equiv of actuales) {
                if (equiv.ordenPrioridad >= nuevaPrioridad) {
                    equiv.ordenPrioridad += 1;
                    if (nuevaPrioridad === 1) {
                        equiv.esPrincipal = false;
                    }
                    await repo.save(equiv);
                }
            }

            const nueva = repo.create({
                articuloId: dto.articuloId,
                codigoArticulo: articulo.codigo,
                itemId: dto.itemId,
                codigoItem: item.codigoInterno,
                ordenPrioridad: nuevaPrioridad,
                esPrincipal: nuevaPrioridad === 1 || actuales.length === 0,
                factorConversion: dto.factorConversion || 1.0,
                observaciones: dto.observaciones?.trim() || null,
                activo: true,
            });

            const saved = await repo.save(nueva);

            // Limpiar alerta de hilado sin item si la tenía
            await manager.query(
                `UPDATE articulos
                 SET "estadoRevision" = 'VERDE', "detalleRevision" = NULL
                 WHERE id = $1 AND "etapa" = 'HILADO'`,
                [dto.articuloId],
            );

            return saved;
        });
    }

    /**
     * Reordena las prioridades de los ítems asociados enviando la lista ordenada de IDs.
     */
    async reordenarPrioridades(articuloId: string, equivalenciaIdsOrdenados: string[]): Promise<any[]> {
        await this.asegurarTabla();

        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(ArticuloItemEquivalenciaEntity);

            for (let i = 0; i < equivalenciaIdsOrdenados.length; i++) {
                const id = equivalenciaIdsOrdenados[i];
                const nuevaPrioridad = i + 1;
                const esPrincipal = nuevaPrioridad === 1;

                await repo.update(
                    { id, articuloId },
                    {
                        ordenPrioridad: nuevaPrioridad,
                        esPrincipal,
                    },
                );
            }

            return this.findByArticulo(articuloId);
        });
    }

    /**
     * Desasocia un ítem de un artículo y renombra las prioridades restantes.
     */
    async desasociarItem(id: string): Promise<{ success: boolean; reordenados: number }> {
        await this.asegurarTabla();

        const equiv = await this.equivalenciaRepo.findOne({ where: { id } });
        if (!equiv) {
            throw new NotFoundException('Equivalencia no encontrada.');
        }

        const articuloId = equiv.articuloId;

        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(ArticuloItemEquivalenciaEntity);
            await repo.delete(id);

            // Renumerar las restantes
            const restantes = await repo.find({
                where: { articuloId },
                order: { ordenPrioridad: 'ASC' },
            });

            for (let i = 0; i < restantes.length; i++) {
                restantes[i].ordenPrioridad = i + 1;
                restantes[i].esPrincipal = i === 0;
                await repo.save(restantes[i]);
            }

            if (restantes.length === 0) {
                await manager.query(
                    `UPDATE articulos
                     SET "estadoRevision" = 'AMARILLO',
                         "detalleRevision" = 'ALERTA: Hilado sin item equivalente en el deposito (vincular cuando ingrese)'
                     WHERE id = $1 AND "etapa" = 'HILADO'`,
                    [articuloId],
                );
            }

            return { success: true, reordenados: restantes.length };
        });
    }

    /**
     * Listado maestro de Artículos con estado de equivalencia (semáforo verde/rojo)
     * pensado para la pantalla de gestión Master-Detail.
     */
    async listarMaestro(filters: MaestroEquivalenciasFilterDto): Promise<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        await this.asegurarTabla();

        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
        const skip = (page - 1) * limit;

        // Por defecto filtra etapa = 'HILADO' (los 54 hilados reales del BOM) si no se especifica otro
        const etapaFiltro = (filters.etapa || filters.tipo || 'HILADO').trim().toUpperCase();

        const applyFilter = (queryBuilder: any) => {
            if (etapaFiltro === 'HILADO' || etapaFiltro === 'INSUMO') {
                queryBuilder.andWhere('a.etapa = :etapa', { etapa: etapaFiltro });
            } else if (etapaFiltro === 'MATERIALES_BOM') {
                queryBuilder.andWhere('a.etapa IN (:...etapas)', { etapas: ['HILADO', 'INSUMO'] });
            } else if (etapaFiltro !== 'TODOS') {
                queryBuilder.andWhere('a.tipo = :tipo', { tipo: etapaFiltro });
            }

            if (filters.search) {
                const term = `%${filters.search.trim()}%`;
                queryBuilder.andWhere('(a.codigo ILIKE :term OR a.descripcion ILIKE :term)', { term });
            }
        };

        const qb = this.articuloRepo
            .createQueryBuilder('a')
            .leftJoin('articulo_item_equivalencias', 'eq', 'eq.articuloId = a.id AND eq.activo = true')
            .select('a.id', 'id')
            .addSelect('a.codigo', 'codigo')
            .addSelect('a.descripcion', 'descripcion')
            .addSelect('a.tipo', 'tipo')
            .addSelect('a.etapa', 'etapa')
            .addSelect('a.estado', 'estado')
            .addSelect('a.estadoRevision', 'estadoRevision')
            .addSelect('a.detalleRevision', 'detalleRevision')
            .addSelect('a.unidadMedida', 'unidadMedida')
            .addSelect('COUNT(eq.id)', 'itemsCount')
            .groupBy('a.id')
            .addGroupBy('a.codigo')
            .addGroupBy('a.descripcion')
            .addGroupBy('a.tipo')
            .addGroupBy('a.etapa')
            .addGroupBy('a.estado')
            .addGroupBy('a.estadoRevision')
            .addGroupBy('a.detalleRevision')
            .addGroupBy('a.unidadMedida')
            .orderBy('a.codigo', 'ASC');

        applyFilter(qb);

        if (filters.soloSinMapear) {
            qb.having('COUNT(eq.id) = 0');
        } else if (filters.soloMapeados) {
            qb.having('COUNT(eq.id) > 0');
        }

        const rawList = await qb.offset(skip).limit(limit).getRawMany();

        // Conteo total para paginación
        const countQb = this.articuloRepo
            .createQueryBuilder('a')
            .leftJoin('articulo_item_equivalencias', 'eq', 'eq.articuloId = a.id AND eq.activo = true')
            .select('a.id');

        applyFilter(countQb);

        if (filters.soloSinMapear) {
            countQb.groupBy('a.id').having('COUNT(eq.id) = 0');
        } else if (filters.soloMapeados) {
            countQb.groupBy('a.id').having('COUNT(eq.id) > 0');
        } else {
            countQb.groupBy('a.id');
        }

        const totalResults = await countQb.getRawMany();
        const total = totalResults.length;

        // Obtener ítem principal y stock total acumulado para los de la página
        const articuloIds = rawList.map((r) => r.id);
        const principales = articuloIds.length > 0
            ? await this.equivalenciaRepo.find({
                where: { articuloId: In(articuloIds), esPrincipal: true, activo: true },
                relations: ['item'],
            })
            : [];

        const principalMap = new Map<string, string>();
        principales.forEach((p) => {
            principalMap.set(p.articuloId, `${p.item?.codigoInterno} - ${p.item?.descripcion}`);
        });

        // Conteo de cuántas estructuras activas usan cada artículo
        const codigosList = rawList.map((r) => r.codigo);
        const usosRows = codigosList.length > 0
            ? await this.dataSource.query(
                `SELECT "codigoComponente", COUNT(*)::int AS usos
                 FROM articulo_estructuras
                 WHERE "codigoComponente" = ANY($1) AND "activo" = true
                 GROUP BY "codigoComponente"`,
                [codigosList],
            )
            : [];
        const usosMap = new Map<string, number>();
        usosRows.forEach((u: any) => usosMap.set(u.codigoComponente, Number(u.usos || 0)));

        const items = rawList.map((r) => {
            const count = parseInt(r.itemsCount, 10) || 0;
            return {
                id: r.id,
                codigo: r.codigo,
                descripcion: r.descripcion,
                tipo: r.tipo,
                etapa: r.etapa,
                estado: r.estado,
                estadoRevision: r.estadoRevision,
                detalleRevision: r.detalleRevision,
                unidadMedida: r.unidadMedida,
                itemsAsignadosCount: count,
                mapeado: count > 0,
                itemPrincipal: principalMap.get(r.id) || null,
                estructurasQueLoUsan: usosMap.get(r.codigo) || 0,
            };
        });

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Algoritmo de sugerencias automáticas:
     * Busca coincidencias entre Artículos TOTVS (MP) e Items existentes en el inventario por código o texto.
     */
    async autoSugerirYVincular(): Promise<{
        evaluados: number;
        coincidenciasEncontradas: number;
        vinculados: number;
        detalles: any[];
    }> {
        await this.asegurarTabla();

        // 1. Obtener todos los artículos MP que aún no tienen equivalencia
        const articulosSinMapeo = await this.articuloRepo
            .createQueryBuilder('a')
            .leftJoin('articulo_item_equivalencias', 'eq', 'eq.articuloId = a.id')
            .where('a.tipo = :tipo', { tipo: 'MP' })
            .andWhere('eq.id IS NULL')
            .getMany();

        // 2. Obtener todos los items del catálogo
        const allItems = await this.itemRepo.find();
        const itemCodeMap = new Map<string, ItemEntity>();
        allItems.forEach((i) => {
            if (i.codigoInterno) {
                itemCodeMap.set(i.codigoInterno.trim().toUpperCase(), i);
            }
        });

        let vinculados = 0;
        const detalles: any[] = [];

        for (const art of articulosSinMapeo) {
            const codArt = art.codigo.trim().toUpperCase();

            // Buscar coincidencia exacta por código
            let matchedItem = itemCodeMap.get(codArt);

            // Si no hay exacta, buscar si el código del ítem está contenido o viceversa
            if (!matchedItem) {
                for (const item of allItems) {
                    const codItem = (item.codigoInterno || '').trim().toUpperCase();
                    if (codItem && (codItem === codArt || codArt.replace(/[-_]/g, '') === codItem.replace(/[-_]/g, ''))) {
                        matchedItem = item;
                        break;
                    }
                }
            }

            if (matchedItem) {
                try {
                    await this.asociarItem({
                        articuloId: art.id,
                        itemId: matchedItem.id,
                        ordenPrioridad: 1,
                        observaciones: 'Asignación automática por coincidencia de código',
                    });
                    vinculados++;
                    detalles.push({
                        articulo: art.codigo,
                        item: matchedItem.codigoInterno,
                        tipoCoincidencia: 'CÓDIGO',
                    });
                } catch (e) {
                    // Ignorar duplicados
                }
            }
        }

        return {
            evaluados: articulosSinMapeo.length,
            coincidenciasEncontradas: detalles.length,
            vinculados,
            detalles,
        };
    }

    /**
     * Sincronización masiva remota de equivalencias (idempotente)
     */
    async seedBatchEquivalencias(items: Array<{
        articuloCodigo: string;
        itemCodigo?: string;
        itemId?: string;
        ordenPrioridad?: number;
        factorConversion?: number;
        observaciones?: string;
    }>): Promise<{ procesados: number; insertados: number; actualizados: number; errores: any[] }> {
        await this.asegurarTabla();

        let insertados = 0;
        let actualizados = 0;
        const errores: any[] = [];

        // Obtener códigos de artículos únicos del lote
        const codigosArt = [...new Set(items.map((i) => (i.articuloCodigo || '').trim().toUpperCase()))].filter(Boolean);
        const articulos = await this.articuloRepo.find({
            where: { codigo: In(codigosArt) },
        });
        const artMap = new Map<string, ArticuloEntity>();
        articulos.forEach((a) => artMap.set(a.codigo.toUpperCase(), a));

        // Obtener códigos de ítems únicos si vienen por código
        const codigosItem = [...new Set(items.map((i) => (i.itemCodigo || '').trim().toUpperCase()))].filter(Boolean);
        const itemIds = [...new Set(items.map((i) => i.itemId).filter(Boolean))] as string[];

        const itemQueryConditions: any[] = [];
        if (codigosItem.length > 0) itemQueryConditions.push({ codigoInterno: In(codigosItem) });
        if (itemIds.length > 0) itemQueryConditions.push({ id: In(itemIds) });

        const itemsDb = itemQueryConditions.length > 0
            ? await this.itemRepo.find({ where: itemQueryConditions })
            : [];

        const itemCodeMap = new Map<string, ItemEntity>();
        const itemIdMap = new Map<string, ItemEntity>();
        itemsDb.forEach((i) => {
            if (i.codigoInterno) itemCodeMap.set(i.codigoInterno.trim().toUpperCase(), i);
            itemIdMap.set(i.id, i);
        });

        for (const input of items) {
            try {
                const codArt = (input.articuloCodigo || '').trim().toUpperCase();
                const art = artMap.get(codArt);
                if (!art) {
                    errores.push({ input, error: `Artículo "${codArt}" no existe en el sistema.` });
                    continue;
                }

                let targetItem: ItemEntity | undefined;
                if (input.itemId) {
                    targetItem = itemIdMap.get(input.itemId);
                }
                if (!targetItem && input.itemCodigo) {
                    targetItem = itemCodeMap.get(input.itemCodigo.trim().toUpperCase());
                }

                if (!targetItem) {
                    errores.push({ input, error: `Ítem "${input.itemCodigo || input.itemId}" no encontrado en el sistema.` });
                    continue;
                }

                const existing = await this.equivalenciaRepo.findOne({
                    where: { articuloId: art.id, itemId: targetItem.id },
                });

                const prioridad = input.ordenPrioridad || 1;
                const esPrincipal = prioridad === 1;
                const factor = input.factorConversion || 1.0;

                if (existing) {
                    existing.ordenPrioridad = prioridad;
                    existing.esPrincipal = esPrincipal;
                    existing.factorConversion = factor;
                    if (input.observaciones !== undefined) existing.observaciones = input.observaciones;
                    existing.activo = true;
                    await this.equivalenciaRepo.save(existing);
                    actualizados++;
                } else {
                    const nueva = this.equivalenciaRepo.create({
                        articuloId: art.id,
                        codigoArticulo: art.codigo,
                        itemId: targetItem.id,
                        codigoItem: targetItem.codigoInterno,
                        ordenPrioridad: prioridad,
                        esPrincipal,
                        factorConversion: factor,
                        observaciones: input.observaciones || null,
                        activo: true,
                    });
                    await this.equivalenciaRepo.save(nueva);
                    insertados++;
                }
            } catch (err: any) {
                errores.push({ input, error: err.message });
            }
        }

        return {
            procesados: items.length,
            insertados,
            actualizados,
            errores,
        };
    }
}

