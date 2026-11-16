import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { ArticuloEntity } from '../../infrastructure/persistence/entities/articulo.entity';
import * as path from 'path';
import * as xlsx from 'xlsx';

export interface ArticulosFilterDto {
    search?: string;
    tipo?: string;
    etapa?: string;
    familia?: string;
    modelo?: string;
    destino?: string;
    estado?: string;
    marca?: string;
    talle?: string;
    tipoArticulo?: string;
    estadoRevision?: string;
    activo?: boolean;
    soloConEtapa?: boolean;
    alerta?: string;
    page?: number;
    limit?: number;
}

export interface ArticuloConAlertas extends ArticuloEntity {
    componentesCount?: number;
    itemsEquivalentesCount?: number;
    itemPrincipalCodigo?: string;
    alertas?: string[];
}

export interface ArticulosPaginationResult {
    items: ArticuloConAlertas[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable()
export class ArticulosService {
    constructor(
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
        private readonly dataSource: DataSource,
    ) { }

    async findAll(filters: ArticulosFilterDto): Promise<ArticulosPaginationResult> {
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
        const skip = (page - 1) * limit;

        const qb = this.articuloRepo.createQueryBuilder('a');

        if (filters.search) {
            const term = `%${filters.search.trim()}%`;
            qb.andWhere(
                '(a.codigo ILIKE :term OR a.descripcion ILIKE :term OR a.modelo ILIKE :term OR a.codigoSusi ILIKE :term)',
                { term },
            );
        }

        if (filters.etapa) {
            qb.andWhere('a.etapa = :etapa', { etapa: filters.etapa.trim().toUpperCase() });
        } else if (filters.soloConEtapa) {
            qb.andWhere('a.etapa IS NOT NULL');
        }

        if (filters.familia) {
            qb.andWhere('a.familia ILIKE :familia', { familia: `%${filters.familia.trim()}%` });
        }

        if (filters.modelo) {
            qb.andWhere('a.modelo ILIKE :modelo', { modelo: `%${filters.modelo.trim()}%` });
        }

        if (filters.destino) {
            qb.andWhere('a.destino = :destino', { destino: filters.destino.trim().toUpperCase() });
        }

        if (filters.estado) {
            qb.andWhere('a.estado = :estado', { estado: filters.estado.trim().toUpperCase() });
        }

        if (filters.marca) {
            qb.andWhere('a.marca ILIKE :marca', { marca: `%${filters.marca.trim()}%` });
        }

        if (filters.talle) {
            qb.andWhere('a.talle = :talle', { talle: filters.talle.trim() });
        }

        if (filters.activo !== undefined) {
            qb.andWhere('a.activo = :activo', { activo: filters.activo });
        }

        if (filters.alerta) {
            const al = filters.alerta.trim().toUpperCase();
            if (al === 'SIN_ESTRUCTURA') {
                qb.andWhere("(a.etapa = 'TERMINADO' OR a.etapa = 'COSTURA') AND NOT EXISTS (SELECT 1 FROM articulo_estructuras ae WHERE ae.\"codigoPadre\" = a.codigo)");
            } else if (al === 'CON_ESTRUCTURA') {
                qb.andWhere("(a.etapa = 'TERMINADO' OR a.etapa = 'COSTURA') AND EXISTS (SELECT 1 FROM articulo_estructuras ae WHERE ae.\"codigoPadre\" = a.codigo)");
            } else if (al === 'TEJIDO_SIN_SUSI') {
                qb.andWhere("a.etapa = 'TEJIDO' AND (a.\"codigoSusi\" IS NULL OR TRIM(a.\"codigoSusi\") = '')");
            } else if (al === 'TEJIDO_CON_SUSI') {
                qb.andWhere("a.etapa = 'TEJIDO' AND a.\"codigoSusi\" IS NOT NULL AND TRIM(a.\"codigoSusi\") != ''");
            } else if (al === 'INSUMO_SIN_ITEM') {
                qb.andWhere("a.etapa = 'INSUMO' AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq.\"articuloId\" = a.id)");
            } else if (al === 'INSUMO_CON_ITEM') {
                qb.andWhere("a.etapa = 'INSUMO' AND EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq.\"articuloId\" = a.id)");
            } else if (al === 'HILADO_SIN_ITEM') {
                qb.andWhere("a.etapa = 'HILADO' AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq.\"articuloId\" = a.id)");
            } else if (al === 'HILADO_CON_ITEM') {
                qb.andWhere("a.etapa = 'HILADO' AND EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq.\"articuloId\" = a.id)");
            } else if (al === 'MATERIAL_SIN_ITEM') {
                qb.andWhere("a.etapa IN ('HILADO', 'INSUMO') AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq.\"articuloId\" = a.id)");
            } else if (al === 'MATERIAL_CON_ITEM') {
                qb.andWhere("a.etapa IN ('HILADO', 'INSUMO') AND EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq.\"articuloId\" = a.id)");
            } else if (al === 'SIN_PESO') {
                qb.andWhere("a.etapa = 'TERMINADO' AND (a.\"pesoU\" IS NULL OR a.\"pesoU\" <= 0)");
            } else if (al === 'PEDIDOS_VENTA_SIN_BOM') {
                qb.andWhere("a.codigo IN (SELECT DISTINCT \"articuloCodigo\" FROM balance_pedidos_ventas WHERE \"tieneEstructura\" = false)");
            } else if (al === 'CON_ALERTAS') {
                qb.andWhere(`(
                    (a.etapa = 'TERMINADO' AND (NOT EXISTS (SELECT 1 FROM articulo_estructuras ae WHERE ae."codigoPadre" = a.codigo) OR a."pesoU" IS NULL OR a."pesoU" <= 0))
                    OR (a.etapa = 'TEJIDO' AND (a."codigoSusi" IS NULL OR TRIM(a."codigoSusi") = ''))
                    OR (a.etapa IN ('HILADO', 'INSUMO') AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = a.id))
                )`);
            } else if (al === 'COMPLETO') {
                qb.andWhere(`NOT (
                    (a.etapa = 'TERMINADO' AND (NOT EXISTS (SELECT 1 FROM articulo_estructuras ae WHERE ae."codigoPadre" = a.codigo) OR a."pesoU" IS NULL OR a."pesoU" <= 0))
                    OR (a.etapa = 'TEJIDO' AND (a."codigoSusi" IS NULL OR TRIM(a."codigoSusi") = ''))
                    OR (a.etapa IN ('HILADO', 'INSUMO') AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = a.id))
                )`);
            }
        }

        qb.orderBy('a.codigo', 'ASC').skip(skip).take(limit);

        const [rawItems, total] = await qb.getManyAndCount();

        // Enriquecer los items con información de conexiones y alertas
        let enrichedItems: ArticuloConAlertas[] = rawItems;
        if (rawItems.length > 0) {
            const codigos = rawItems.map(i => i.codigo);
            const ids = rawItems.map(i => i.id);

            const [estructurasCounts, equivalenciasCounts, equivalenciasPrincipales] = await Promise.all([
                this.dataSource.query(`
                    SELECT "codigoPadre", COUNT(*)::int AS count 
                    FROM articulo_estructuras 
                    WHERE "codigoPadre" = ANY($1) 
                    GROUP BY "codigoPadre"
                `, [codigos]),
                this.dataSource.query(`
                    SELECT "articuloId", COUNT(*)::int AS count 
                    FROM articulo_item_equivalencias 
                    WHERE "articuloId" = ANY($1) 
                    GROUP BY "articuloId"
                `, [ids]),
                this.dataSource.query(`
                    SELECT DISTINCT ON ("articuloId") "articuloId", "codigoItem"
                    FROM articulo_item_equivalencias
                    WHERE "articuloId" = ANY($1)
                    ORDER BY "articuloId", "esPrincipal" DESC, "ordenPrioridad" ASC
                `, [ids]),
            ]);

            const estMap = new Map<string, number>();
            estructurasCounts.forEach((r: any) => estMap.set(r.codigoPadre, Number(r.count || 0)));

            const eqMap = new Map<string, number>();
            equivalenciasCounts.forEach((r: any) => eqMap.set(r.articuloId, Number(r.count || 0)));

            const eqPrinMap = new Map<string, string>();
            equivalenciasPrincipales.forEach((r: any) => eqPrinMap.set(r.articuloId, r.codigoItem));

            enrichedItems = rawItems.map(item => {
                const compCount = estMap.get(item.codigo) || 0;
                const eqCount = eqMap.get(item.id) || 0;
                const eqPrincipal = eqPrinMap.get(item.id);
                const alertas: string[] = [];

                if (item.etapa === 'TERMINADO') {
                    if (compCount === 0) alertas.push('SIN_ESTRUCTURA');
                    if (item.pesoU === null || Number(item.pesoU) <= 0) alertas.push('SIN_PESO');
                } else if (item.etapa === 'COSTURA') {
                    if (compCount === 0) alertas.push('SIN_ESTRUCTURA');
                } else if (item.etapa === 'TEJIDO') {
                    if (!item.codigoSusi || item.codigoSusi.trim() === '') alertas.push('TEJIDO_SIN_SUSI');
                } else if (item.etapa === 'HILADO' || item.etapa === 'INSUMO') {
                    if (eqCount === 0) alertas.push('MATERIAL_SIN_ITEM');
                }

                return {
                    ...item,
                    componentesCount: compCount,
                    itemsEquivalentesCount: eqCount,
                    itemPrincipalCodigo: eqPrincipal,
                    alertas,
                };
            });
        }

        return {
            items: enrichedItems,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Resumen en vivo de contadores de alertas y totales globales de artículos por etapa
     */
    async getResumenAlertas(): Promise<{
        totalArticulos: number;
        totalTerminados: number;
        totalCostura: number;
        totalTejido: number;
        totalHilados: number;
        totalInsumos: number;
        sinEstructura: number;
        conEstructura: number;
        tejidoSinSusi: number;
        tejidoConSusi: number;
        hiladosSinItem: number;
        hiladosConItem: number;
        insumosSinItem: number;
        insumosConItem: number;
        materialSinItem: number;
        sinPeso: number;
        conAlertas: number;
    }> {
        const raw = await this.dataSource.query(`
            SELECT 
                COUNT(*)::int AS "totalArticulos",
                COUNT(*) FILTER (WHERE etapa = 'TERMINADO')::int AS "totalTerminados",
                COUNT(*) FILTER (WHERE etapa = 'COSTURA')::int AS "totalCostura",
                COUNT(*) FILTER (WHERE etapa = 'TEJIDO')::int AS "totalTejido",
                COUNT(*) FILTER (WHERE etapa = 'HILADO')::int AS "totalHilados",
                COUNT(*) FILTER (WHERE etapa = 'INSUMO')::int AS "totalInsumos",
                COUNT(*) FILTER (WHERE etapa IN ('TERMINADO', 'COSTURA') AND NOT EXISTS (SELECT 1 FROM articulo_estructuras ae WHERE ae."codigoPadre" = articulos.codigo))::int AS "sinEstructura",
                COUNT(*) FILTER (WHERE etapa IN ('TERMINADO', 'COSTURA') AND EXISTS (SELECT 1 FROM articulo_estructuras ae WHERE ae."codigoPadre" = articulos.codigo))::int AS "conEstructura",
                COUNT(*) FILTER (WHERE etapa = 'TEJIDO' AND ("codigoSusi" IS NULL OR TRIM("codigoSusi") = ''))::int AS "tejidoSinSusi",
                COUNT(*) FILTER (WHERE etapa = 'TEJIDO' AND "codigoSusi" IS NOT NULL AND TRIM("codigoSusi") != '')::int AS "tejidoConSusi",
                COUNT(*) FILTER (WHERE etapa = 'HILADO' AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = articulos.id))::int AS "hiladosSinItem",
                COUNT(*) FILTER (WHERE etapa = 'HILADO' AND EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = articulos.id))::int AS "hiladosConItem",
                COUNT(*) FILTER (WHERE etapa = 'INSUMO' AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = articulos.id))::int AS "insumosSinItem",
                COUNT(*) FILTER (WHERE etapa = 'INSUMO' AND EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = articulos.id))::int AS "insumosConItem",
                COUNT(*) FILTER (WHERE etapa IN ('HILADO', 'INSUMO') AND NOT EXISTS (SELECT 1 FROM articulo_item_equivalencias eq WHERE eq."articuloId" = articulos.id))::int AS "materialSinItem",
                COUNT(*) FILTER (WHERE etapa = 'TERMINADO' AND ("pesoU" IS NULL OR "pesoU" <= 0))::int AS "sinPeso"
            FROM articulos
            WHERE activo = true;
        `);

        const r = raw[0] || {};
        const sinEst = Number(r.sinEstructura || 0);
        const conEst = Number(r.conEstructura || 0);
        const tejSinSusi = Number(r.tejidoSinSusi || 0);
        const tejConSusi = Number(r.tejidoConSusi || 0);
        const hilSinItem = Number(r.hiladosSinItem || 0);
        const hilConItem = Number(r.hiladosConItem || 0);
        const insSinItem = Number(r.insumosSinItem || 0);
        const insConItem = Number(r.insumosConItem || 0);
        const matSinItem = Number(r.materialSinItem || 0);
        const sinPeso = Number(r.sinPeso || 0);

        return {
            totalArticulos: Number(r.totalArticulos || 0),
            totalTerminados: Number(r.totalTerminados || 0),
            totalCostura: Number(r.totalCostura || 0),
            totalTejido: Number(r.totalTejido || 0),
            totalHilados: Number(r.totalHilados || 0),
            totalInsumos: Number(r.totalInsumos || 0),
            sinEstructura: sinEst,
            conEstructura: conEst,
            tejidoSinSusi: tejSinSusi,
            tejidoConSusi: tejConSusi,
            hiladosSinItem: hilSinItem,
            hiladosConItem: hilConItem,
            insumosSinItem: insSinItem,
            insumosConItem: insConItem,
            materialSinItem: matSinItem,
            sinPeso,
            conAlertas: sinEst + tejSinSusi + matSinItem + sinPeso,
        };
    }

    async findOne(id: string): Promise<ArticuloEntity> {
        const articulo = await this.articuloRepo.findOne({ where: { id } });
        if (!articulo) {
            throw new NotFoundException(`Artículo con ID ${id} no encontrado`);
        }
        return articulo;
    }

    async findByCodigo(codigo: string): Promise<ArticuloEntity> {
        const articulo = await this.articuloRepo.findOne({
            where: { codigo: codigo.trim().toUpperCase() },
        });
        if (!articulo) {
            throw new NotFoundException(`Artículo con código ${codigo} no encontrado`);
        }
        return articulo;
    }

    async create(dto: Partial<ArticuloEntity>): Promise<ArticuloEntity> {
        if (!dto.codigo || !dto.descripcion) {
            throw new BadRequestException('El código y la descripción son obligatorios.');
        }

        const codigoUpper = dto.codigo.trim().toUpperCase();
        const existing = await this.articuloRepo.findOne({ where: { codigo: codigoUpper } });
        if (existing) {
            throw new BadRequestException(`Ya existe un artículo con el código ${codigoUpper}.`);
        }

        const etapaUpper = dto.etapa ? dto.etapa.trim().toUpperCase() : null;
        const defaultUM = etapaUpper === 'HILADO' ? 'KG' : 'UN';

        const entity = this.articuloRepo.create({
            ...dto,
            codigo: codigoUpper,
            etapa: etapaUpper,
            unidadMedida: (dto.unidadMedida || defaultUM).trim().toUpperCase(),
            estado: (dto.estado || 'CONTROLAR').trim().toUpperCase(),
            activo: dto.estado === 'DESHABILITADO' ? false : (dto.activo ?? true),
        });

        return this.articuloRepo.save(entity);
    }

    async update(id: string, dto: Partial<ArticuloEntity>): Promise<ArticuloEntity> {
        const articulo = await this.findOne(id);

        if (dto.codigo && dto.codigo.trim().toUpperCase() !== articulo.codigo) {
            const codigoUpper = dto.codigo.trim().toUpperCase();
            const existing = await this.articuloRepo.findOne({ where: { codigo: codigoUpper } });
            if (existing && existing.id !== id) {
                throw new BadRequestException(`Ya existe otro artículo con el código ${codigoUpper}.`);
            }
            // Actualizar referencias textuales en estructuras y equivalencias
            await this.dataSource.query(
                `UPDATE articulo_estructuras SET "codigoPadre" = $1 WHERE "codigoPadre" = $2`,
                [codigoUpper, articulo.codigo],
            );
            await this.dataSource.query(
                `UPDATE articulo_estructuras SET "codigoComponente" = $1 WHERE "codigoComponente" = $2`,
                [codigoUpper, articulo.codigo],
            );
            await this.dataSource.query(
                `UPDATE articulo_item_equivalencias SET "codigoArticulo" = $1 WHERE "codigoArticulo" = $2`,
                [codigoUpper, articulo.codigo],
            );
            articulo.codigo = codigoUpper;
        }

        if (dto.estado) {
            dto.activo = dto.estado === 'DESHABILITADO' ? false : true;
        }

        Object.assign(articulo, dto);
        return this.articuloRepo.save(articulo);
    }

    /**
     * Importación / sincronización masiva desde el archivo Excel TOTVS SB1- PRODUCTOS.xlsx
     */
    async sincronizarDesdeTotvs(customFilePath?: string): Promise<{
        totalLeidos: number;
        procesados: number;
        creados: number;
        actualizados: number;
        errores: number;
    }> {
        const filePath =
            customFilePath ||
            path.resolve('C:/Users/Admin/Desktop/totvs21-9/SB1- PRODUCTOS.xlsx');

        const wb = xlsx.readFile(filePath);
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // Las filas 0, 1 y 2 son encabezados y descripciones de TOTVS
        const dataRows = rows.slice(3).filter((r) => r && r[0]);

        let creados = 0;
        let actualizados = 0;
        let errores = 0;

        // Procesar en lotes de 200 para alta performance
        const BATCH_SIZE = 200;
        for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
            const chunk = dataRows.slice(i, i + BATCH_SIZE);

            await this.dataSource.transaction(async (manager) => {
                for (const row of chunk) {
                    try {
                        const codigo = String(row[0]).trim().toUpperCase();
                        const descripcion = String(row[1] || '').trim();
                        const tipo = String(row[2] || 'PA').trim().toUpperCase();
                        const unidadMedida = String(row[3] || 'UN').trim().toUpperCase();

                        let item = await manager.findOne(ArticuloEntity, { where: { codigo } });

                        let etapa: string | null = null;
                        if (tipo === 'PA') etapa = 'TERMINADO';
                        else if (tipo === 'PI') etapa = 'COSTURA';
                        else if (tipo === 'MP') etapa = 'HILADO';
                        else if (tipo === 'ME' || tipo === 'MC') etapa = 'INSUMO';

                        const data: Partial<ArticuloEntity> = {
                            codigo,
                            descripcion,
                            unidadMedida,
                            etapa,
                            marca: row[27] ? String(row[27]).trim() : null,
                            talle: row[28] ? String(row[28]).trim() : null,
                            pesoU: row[30] != null ? Number(row[30]) : null,
                            estado: 'CONTROLAR',
                            activo: true,
                        };

                        if (!item) {
                            const newEntity = manager.create(ArticuloEntity, data);
                            await manager.save(ArticuloEntity, newEntity);
                            creados++;
                        } else {
                            Object.assign(item, data);
                            await manager.save(ArticuloEntity, item);
                            actualizados++;
                        }
                    } catch (e) {
                        errores++;
                    }
                }
            });
        }

        return {
            totalLeidos: dataRows.length,
            procesados: creados + actualizados,
            creados,
            actualizados,
            errores,
        };
    }

    private static tablasVerificadas = false;

    async asegurarTablasEstructura(): Promise<void> {
        if (ArticulosService.tablasVerificadas) return;

        await this.dataSource.query(`
            CREATE TABLE IF NOT EXISTS "articulos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "codigo" character varying(50) NOT NULL,
                "descripcion" character varying(255) NOT NULL,
                "unidadMedida" character varying(10) NOT NULL DEFAULT 'UN',
                "marca" character varying(50),
                "talle" character varying(20),
                "pesoU" numeric(10,4),
                "modelo" character varying(50),
                "destino" character varying(10),
                "variante" character varying(20),
                "etapa" character varying(20),
                "familia" character varying(60),
                "codigoSusi" character varying(80),
                "estado" character varying(15) NOT NULL DEFAULT 'CONTROLAR',
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_articulos_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_articulos_codigo" UNIQUE ("codigo")
            );

            CREATE INDEX IF NOT EXISTS "IDX_articulos_marca" ON "articulos" ("marca");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_talle" ON "articulos" ("talle");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_etapa" ON "articulos" ("etapa");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_codigoSusi" ON "articulos" ("codigoSusi");

            DO $$ BEGIN
                CREATE TYPE "tipo_movimiento_articulo_enum" AS ENUM (
                    'ENTRADA', 'SALIDA', 'AJUSTE_SUMA', 'AJUSTE_RESTA',
                    'SACADA_SEGUNDA', 'RECHAZO', 'ANULACION_ENTRADA',
                    'ANULACION_SALIDA', 'ANULACION_AJUSTE_SUMA',
                    'ANULACION_AJUSTE_RESTA', 'ANULACION_SACADA_SEGUNDA',
                    'ANULACION_RECHAZO'
                );
            EXCEPTION WHEN duplicate_object THEN null; END $$;

            DO $$ BEGIN
                CREATE TYPE "movimiento_articulo_status_enum" AS ENUM ('ACTIVO', 'ANULADO');
            EXCEPTION WHEN duplicate_object THEN null; END $$;

            CREATE TABLE IF NOT EXISTS "movimientos_articulos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tipo" "tipo_movimiento_articulo_enum" NOT NULL,
                "articuloId" uuid NOT NULL,
                "deposito" character varying(50) NOT NULL DEFAULT 'TERMINADO',
                "posicion" character varying(50) DEFAULT 'GENERAL',
                "etapa" character varying(20) DEFAULT 'TERMINADO',
                "cantidad" numeric(14,3) NOT NULL,
                "lote" character varying(100),
                "documentoReferencia" character varying(100),
                "observaciones" text,
                "fecha" date NOT NULL,
                "userId" character varying(100),
                "status" "movimiento_articulo_status_enum" NOT NULL DEFAULT 'ACTIVO',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_movimientos_articulos_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_movimientos_articulos_articulo" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS "balance_stock_articulos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "articuloId" uuid NOT NULL,
                "deposito" character varying(50) NOT NULL DEFAULT 'TERMINADO',
                "posicion" character varying(50) DEFAULT 'GENERAL',
                "stockActual" numeric(14,3) NOT NULL DEFAULT 0,
                "totalEntradas" numeric(14,3) NOT NULL DEFAULT 0,
                "totalSalidas" numeric(14,3) NOT NULL DEFAULT 0,
                "totalSegunda" numeric(14,3) NOT NULL DEFAULT 0,
                "totalRechazos" numeric(14,3) NOT NULL DEFAULT 0,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_balance_stock_articulos_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_balance_stock_articulos_articulo" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_balance_stock_articulos_articulo_deposito" UNIQUE ("articuloId", "deposito")
            );
        `);

        ArticulosService.tablasVerificadas = true;
    }

    async ejecutarLimpiezaHuerfanos(): Promise<{ success: boolean; message: string }> {
        await this.dataSource.query(`
            DROP TABLE IF EXISTS "stg_articulos" CASCADE;
            DROP TABLE IF EXISTS "stg_totvs" CASCADE;
            DROP TABLE IF EXISTS "stg_sb1" CASCADE;
            DROP TABLE IF EXISTS "stg_sg1" CASCADE;
            DROP TABLE IF EXISTS "articulo_item_refs" CASCADE;
            DROP TABLE IF EXISTS "articulo_categorias" CASCADE;
            DO $$ BEGIN
                DROP TYPE IF EXISTS "articulo_item_refs_rol_enum" CASCADE;
            EXCEPTION WHEN OTHERS THEN null;
            END $$;

            ALTER TABLE IF EXISTS "articulos"
                DROP COLUMN IF EXISTS "almacen",
                DROP COLUMN IF EXISTS "grupo",
                DROP COLUMN IF EXISTS "segundaUnidadMedida",
                DROP COLUMN IF EXISTS "factorConversion",
                DROP COLUMN IF EXISTS "tipoConversion",
                DROP COLUMN IF EXISTS "usaLote",
                DROP COLUMN IF EXISTS "usaUbicacion",
                DROP COLUMN IF EXISTS "ctdEmbalaje",
                DROP COLUMN IF EXISTS "puntoPedido",
                DROP COLUMN IF EXISTS "stockSeguridad",
                DROP COLUMN IF EXISTS "plazoEntrega",
                DROP COLUMN IF EXISTS "tipoPlazo",
                DROP COLUMN IF EXISTS "loteEconomico",
                DROP COLUMN IF EXISTS "tipoDecOP",
                DROP COLUMN IF EXISTS "entraMrp",
                DROP COLUMN IF EXISTS "stockMaximo",
                DROP COLUMN IF EXISTS "atiendeNe",
                DROP COLUMN IF EXISTS "tipoCC",
                DROP COLUMN IF EXISTS "detalleFalla";

            ALTER TABLE IF EXISTS "articulo_estructuras"
                DROP COLUMN IF EXISTS "posicion",
                DROP COLUMN IF EXISTS "secuencia",
                DROP COLUMN IF EXISTS "fechaInicio",
                DROP COLUMN IF EXISTS "fechaFin",
                DROP COLUMN IF EXISTS "tipoFijoVariable",
                DROP COLUMN IF EXISTS "revisionInicial",
                DROP COLUMN IF EXISTS "revisionFinal",
                DROP COLUMN IF EXISTS "detalleFalla",
                DROP COLUMN IF EXISTS "componenteAnterior";

            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions') THEN
                    DELETE FROM "positions" 
                    WHERE "depositoId" IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')
                      AND "id" NOT IN (SELECT DISTINCT "posicionId" FROM "stock_balance" WHERE "posicionId" IS NOT NULL);
                END IF;

                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depots') THEN
                    DELETE FROM "depots" 
                    WHERE "id" IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')
                      AND "id" NOT IN (SELECT DISTINCT "depositoId" FROM "stock_balance" WHERE "depositoId" IS NOT NULL);
                END IF;
            END $$;
        `);

        return { success: true, message: 'Tablas stg_, tablas viejas de calidad y columnas obsoletas eliminadas exitosamente.' };
    }

    async seedBatchItems(items: Array<Partial<ArticuloEntity>>): Promise<{ procesados: number; creados: number; actualizados: number }> {
        await this.asegurarTablasEstructura();

        let creados = 0;
        let actualizados = 0;

        await this.dataSource.transaction(async (manager) => {
            for (const item of items) {
                if (!item.codigo) continue;
                const codigo = String(item.codigo).trim().toUpperCase();

                const existing = await manager.findOne(ArticuloEntity, { where: { codigo } });
                if (!existing) {
                    const newEntity = manager.create(ArticuloEntity, {
                        ...item,
                        codigo,
                        activo: true,
                    });
                    await manager.save(ArticuloEntity, newEntity);
                    creados++;
                } else {
                    Object.assign(existing, item, { codigo });
                    await manager.save(ArticuloEntity, existing);
                    actualizados++;
                }
            }
        });

        return { procesados: creados + actualizados, creados, actualizados };
    }

    /**
     * Obtiene los tipos de máquina compatibles con un artículo y sus tiempos de tejido
     */
    async getArticuloMachineTypes(articuloId: string) {
        return this.dataSource.query(`
            SELECT 
                amt."articuloId",
                amt."machineTypeId",
                amt."cycleTimeSeconds",
                amt."timeSource",
                amt."status",
                COALESCE(amt."preferida", false) AS "preferida",
                mt.name AS "machineTypeName",
                mt.category,
                mt.marca,
                mt.modelo,
                mt.cant_agujas AS "cantAgujas",
                mt.cilindro,
                mt.puntera
            FROM articulo_machine_types amt
            JOIN machine_types mt ON mt.id = amt."machineTypeId"
            WHERE amt."articuloId" = $1
            ORDER BY COALESCE(amt."preferida", false) DESC, amt."cycleTimeSeconds" ASC NULLS LAST, mt.name ASC
        `, [articuloId]);
    }

    /**
     * Lista todos los tipos de máquina disponibles en el catálogo (SOLO LECTURA de machine_types)
     */
    async getAvailableMachineTypes(category?: string) {
        const params: any[] = [];
        let where = '';
        if (category) {
            where = `WHERE mt.category = $1`;
            params.push(category.trim().toUpperCase());
        }
        return this.dataSource.query(`
            SELECT
                mt.id,
                mt.name,
                mt.category,
                mt.marca,
                mt.modelo,
                mt.cant_agujas AS "cantAgujas",
                mt.cilindro,
                mt.puntera
            FROM machine_types mt
            ${where}
            ORDER BY mt.category ASC, mt.marca ASC, mt.modelo ASC, mt.cant_agujas ASC
        `, params);
    }

    /**
     * Obtiene todos los artículos con su resumen de máquinas asignadas y estado
     */
    async getArticulosConMaquinas(filters: {
        search?: string;
        etapa?: string;
        familia?: string;
        status?: string;
        page?: number;
        limit?: number;
    }) {
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
        const offset = (page - 1) * limit;

        const etapa = (filters.etapa || 'TEJIDO').trim().toUpperCase();
        let whereClause = etapa === 'TODOS' ? `WHERE a.etapa IN ('TEJIDO', 'COSTURA', 'TERMINADO')` : `WHERE a.etapa = $1`;
        const params: any[] = etapa === 'TODOS' ? [] : [etapa];
        let pIdx = params.length + 1;

        if (filters.search) {
            whereClause += ` AND (a.codigo ILIKE $${pIdx} OR a.descripcion ILIKE $${pIdx} OR a.modelo ILIKE $${pIdx})`;
            params.push(`%${filters.search.trim()}%`);
            pIdx++;
        }

        if (filters.familia) {
            whereClause += ` AND a.familia ILIKE $${pIdx}`;
            params.push(`%${filters.familia.trim()}%`);
            pIdx++;
        }

        let havingClause = '';
        if (filters.status === 'CONFIRMADO') {
            havingClause = `HAVING COUNT(amt."machineTypeId") > 0 AND COUNT(CASE WHEN amt.status = 'ESTIMADO' THEN 1 END) = 0`;
        } else if (filters.status === 'ESTIMADO') {
            havingClause = `HAVING COUNT(CASE WHEN amt.status = 'ESTIMADO' THEN 1 END) > 0`;
        } else if (filters.status === 'SIN_ASIGNAR') {
            havingClause = `HAVING COUNT(amt."machineTypeId") = 0`;
        }

        const baseSelect = `
            SELECT 
                a.id,
                a.codigo,
                a.descripcion,
                a.tipo,
                a.etapa,
                a.modelo,
                a.familia,
                a.variante,
                a.talle,
                a.marca,
                COUNT(amt."machineTypeId") as "totalMachineTypes",
                COUNT(CASE WHEN amt.status = 'CONFIRMADO' THEN 1 END) as "confirmadosCount",
                COUNT(CASE WHEN amt.status = 'ESTIMADO' THEN 1 END) as "estimadosCount",
                ROUND(AVG(amt."cycleTimeSeconds"), 1) as "avgCycleTimeSeconds",
                MIN(CASE WHEN amt.preferida = true THEN amt."cycleTimeSeconds" END) as "preferredCycleTimeSeconds",
                CASE 
                    WHEN COUNT(amt."machineTypeId") = 0 THEN 'SIN_ASIGNAR'
                    WHEN COUNT(CASE WHEN amt.status = 'ESTIMADO' THEN 1 END) > 0 THEN 'ESTIMADO'
                    ELSE 'CONFIRMADO'
                END as "overallStatus"
            FROM articulos a
            LEFT JOIN articulo_machine_types amt ON amt."articuloId" = a.id
            ${whereClause}
            GROUP BY a.id, a.codigo, a.descripcion, a.tipo, a.etapa, a.modelo, a.familia, a.variante, a.talle, a.marca
            ${havingClause}
        `;

        const countQuery = `SELECT COUNT(*) as total FROM (${baseSelect}) sub`;
        const totalRes = await this.dataSource.query(countQuery, params);
        const total = parseInt(totalRes[0]?.total || '0', 10);

        const dataQuery = `
            ${baseSelect}
            ORDER BY a.codigo ASC
            LIMIT $${pIdx} OFFSET $${pIdx + 1}
        `;
        const dataParams = [...params, limit, offset];
        const items = await this.dataSource.query(dataQuery, dataParams);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Actualiza o crea manualmente una asignación de tipo de máquina con su tiempo
     */
    async updateArticuloMachineType(
        articuloId: string,
        machineTypeId: string,
        dto: { cycleTimeSeconds: number; status?: string; timeSource?: string; preferida?: boolean },
    ) {
        return this.dataSource.transaction(async (manager) => {
            if (dto.preferida) {
                await manager.query(
                    `UPDATE articulo_machine_types SET "preferida" = false WHERE "articuloId" = $1`,
                    [articuloId],
                );
            }

            await manager.query(`
                INSERT INTO articulo_machine_types ("articuloId", "machineTypeId", "cycleTimeSeconds", "timeSource", "status", "preferida")
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT ("articuloId", "machineTypeId") DO UPDATE
                SET "cycleTimeSeconds" = EXCLUDED."cycleTimeSeconds",
                    "timeSource" = EXCLUDED."timeSource",
                    "status" = EXCLUDED."status",
                    "preferida" = CASE WHEN $6 IS NOT NULL THEN EXCLUDED."preferida" ELSE articulo_machine_types."preferida" END
            `, [
                articuloId,
                machineTypeId,
                dto.cycleTimeSeconds,
                dto.timeSource || 'MANUAL',
                dto.status || 'CONFIRMADO',
                dto.preferida ?? false,
            ]);

            return { success: true };
        });
    }

    async deleteArticuloMachineType(articuloId: string, machineTypeId: string) {
        await this.dataSource.query(
            `DELETE FROM articulo_machine_types WHERE "articuloId" = $1 AND "machineTypeId" = $2`,
            [articuloId, machineTypeId],
        );
        return { success: true };
    }
}
