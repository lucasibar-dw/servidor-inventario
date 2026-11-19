import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ItemEntity } from '../../../config/infrastructure/persistence/entities/item.entity';
import { SUSI_ALIAS_TO_TEJIDO } from './susi-alias.data';

export enum EstadoRevisionArticulo {
    PENDIENTE = 'PENDIENTE',
    CHEQUEADO = 'CHEQUEADO',
    CON_DUDAS = 'CON_DUDAS',
    INCOMPLETO = 'INCOMPLETO',
}

export interface ArticuloCatalogItem {
    id: string;
    codigo: string;
    descripcion: string;
    marca?: string | null;
    modelo?: string | null;
    talle?: string | null;
    variante?: string | null;
    etapa?: string | null;
    familia?: string | null;
    codigoSusi?: string | null;
    estado?: string | null;
    estadoRevision?: EstadoRevisionArticulo;
    cycleTimeByMachineType: Map<string, number>;
    defaultCycleTimeSeconds: number;
    bomRefs: {
        codigoComponente: string;
        descripcionComponente: string;
        cantidadKgPorDocena: number;
        item: ItemEntity | null;
    }[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');

export interface ParsedMachineEntry {
    machine: number;
    machineDbId?: string | null;
    machineTypeName?: string | null;
    machineStatus?: string | null;
    articleRaw: string;
    descRaw: string;
    colorRaw: string;
    page: number;
    file: string;
    date: string;
    shift: 'M' | 'N' | string;
    area: string;
    talle?: string;
    articleCode?: string;
    matchedArticle?: {
        id: string;
        codigo: string;
        descripcion: string;
        marca?: string | null;
        modelo?: string | null;
        talle?: string | null;
        variante?: string | null;
        codigoSusi?: string | null;
        estadoRevision?: EstadoRevisionArticulo;
    } | null;
    isUnreviewed?: boolean;
    // Campos de cálculo horario, cambio a las 08:00 AM y producción por máquina
    orderInShift?: number;
    totalArticlesInMachineShift?: number;
    hasChangeover?: boolean;
    changeoverRole?: 'UNICO' | 'SALIENTE_08AM' | 'ENTRANTE_08AM';
    changeoverType?: string | null;
    changeoverTypes?: string[];
    changeoverDurationMinutes?: number;
    horarioTexto?: string;
    grossHours?: number;
    netHours?: number;
    netSeconds?: number;
    cycleTimeSeconds?: number;
    mediasEstimadas?: number;
    paresEstimados?: number;
    docenasEstimadas?: number;
    hiladosMaquina?: {
        codigoComponente: string;
        codigoItem: string;
        descripcion: string;
        kgPorDocena: number;
        consumoKg: number;
        conosEstimados: number;
    }[];
    salienteArticuloAnterior?: {
        articleCode: string;
        articleRaw?: string;
        descRaw?: string;
        talle?: string;
        colorRaw?: string;
    } | null;
}

export interface ArticuloProduccionSummary {
    codigo: string;
    codigoOriginalPdf: string;
    codigoSusi?: string | null;
    descripcion: string;
    marca: string;
    talles: string[];
    colores: string[];
    turnos: string[];
    fechas: string[];
    maquinasCount: number;
    maquinas: number[];
    maquinasDetalle: {
        machine: number;
        shift: string;
        area: string;
        talle: string;
        color: string;
        date: string;
        hasChangeover?: boolean;
        changeoverRole?: string;
        changeoverType?: string | null;
        netHours?: number;
        cycleTimeSeconds?: number;
        mediasEstimadas?: number;
        paresEstimados?: number;
        docenasEstimadas?: number;
    }[];
    cycleTimeSecondsPromedio: number;
    horasTejidoTotales: number;
    mediasTotales: number;
    paresTotales: number;
    docenasTotales: number;
    kilosHiladoTotales: number;
    estadoRevision: EstadoRevisionArticulo | 'NO_ENCONTRADO';
    isUnreviewed: boolean;
    advertencia?: string;
    itemRefs: any[];
    articuloId?: string;
}

export interface MaterialAsignadoSummary {
    itemId: string;
    codigoInterno: string;
    codigoComponenteBom?: string;
    descripcion: string;
    categoriaNombre?: string | null;
    rol: string;
    tono: string | null;
    colorNombre: string | null;
    proveedor?: string | null;
    rotacion?: string | null;
    unidadPrincipal?: string | null;
    pesoConoKg?: number;
    maquinasCount: number;
    maquinas: number[];
    consumoTotalKg: number;
    consumoMananaKg: number;
    consumoNocheKg: number;
    conosTotales: number;
    // Datos de Stock (Picking vs Reserva / General) y Compras
    stockEnPickingKg: number;
    stockEnReservaKg: number;
    stockActualTotalKg: number;
    stockMinimoKg: number;
    aPasarAPickingKg: number;
    stockRestanteTotalKg: number;
    aComprarKg: number;
    posicionesPickingSugeridas: string[];
    posicionesStockReserva: string[];
    partidaSugerida?: string | null;
    posicionOrigenSugerida?: string | null;
    esSustituto?: boolean;
    prioridad?: number;
    sustitutoMotivo?: string | null;
    estadoAbastecimiento: 'CRITICO_COMPRAR' | 'ALERTA_MINIMO' | 'REPONER_PICKING' | 'OK';
    articulosAsignados: {
        codigoArticulo: string;
        descripcionArticulo: string;
        maquinas: number[];
        docenasTejidas: number;
        consumoKg: number;
        isUnreviewed?: boolean;
    }[];
}

export interface HojaRepartidorItem {
    id: string;
    area: string;
    shift: string;
    maquinas: number[];
    maquinasCount: number;
    codigoArticulo: string;
    codigoOriginalPdf: string;
    descripcionArticulo: string;
    talle: string;
    color: string;
    horasTejido: number;
    mediasEstimadas: number;
    paresEstimados: number;
    docenasEstimadas: number;
    cambiosDetalle: string[];
    materiales: {
        codigo: string;
        descripcion: string;
        rol?: string;
        colorNombre?: string | null;
        kgPorDocena?: number;
        consumoKg?: number;
        conos?: number;
        posicionPicking?: string;
    }[];
    isUnreviewed: boolean;
}

export interface HojaPickingItem {
    id: string;
    itemId: string;
    codigoMaterial: string;
    descripcionMaterial: string;
    categoriaNombre: string | null;
    tono: string | null;
    colorNombre: string | null;
    proveedor?: string | null;
    rol: string;
    maquinasCount: number;
    maquinas: number[];
    areas: string[];
    articulos: string[];
    consumoDiaKg: number;
    consumoMananaKg: number;
    consumoNocheKg: number;
    conosNecesarios: number;
    stockEnPickingKg: number;
    stockEnReservaKg: number;
    stockActualTotalKg: number;
    stockMinimoKg: number;
    aPasarAPickingKg: number;
    stockRestanteTotalKg: number;
    aComprarKg: number;
    posicionesPickingSugeridas: string[];
    posicionesStockReserva: string[];
    partidaSugerida?: string | null;
    posicionOrigenSugerida?: string | null;
    esSustituto?: boolean;
    prioridad?: number;
    sustitutoMotivo?: string | null;
    estadoAbastecimiento: 'CRITICO_COMPRAR' | 'ALERTA_MINIMO' | 'REPONER_PICKING' | 'OK';
    hasUnreviewedArticles: boolean;
}

export type EstadoMatchArticuloPlanilla =
    | 'OK'
    | 'SIN_MATCH'
    | 'SIN_ESTRUCTURA'
    | 'ESTRUCTURA_INCOMPLETA';

export interface HiladoPlanillaItem {
    id: string;
    itemId: string | null;
    codigoHilado: string;
    codigoComponenteBom: string;
    descripcionHilado: string;
    categoria: string;
    tipoMaterialCono: 'ALGODON' | 'NYLON' | 'LYCRA' | 'GOMA' | 'OTRO';
    kilosPedido: number;
    kilosManana: number;
    kilosNoche: number;
    pesoConoKg: number;
    pesoConoEsEstimado: boolean;
    motivoPesoCono: string;
    conos: number;
    stockTotalKg: number;
    stockPickingKg: number;
    stockReservaKg: number;
    posicionesPicking: string[];
    sinEquivalenciaItem: boolean;
    esSustituto: boolean;
    sustitutoMotivo: string | null;
    maquinasCount: number;
    maquinas: number[];
    articulosDetalle: {
        codigoArticulo: string;
        codigoSusana: string;
        descripcion: string;
        maquinas: number[];
        horasTejido: number;
        docenas: number;
        kilos: number;
        ritmoEsEstimado: boolean;
    }[];
}

export interface CambioArticuloRef {
    codigoSusana: string;
    codigoCatalogo: string | null;
    articuloId: string | null;
    descripcion: string;
    talle: string;
    color: string;
    estadoMatch: EstadoMatchArticuloPlanilla;
}

export interface CambioPlanillaItem {
    id: string;
    fecha: string;
    maquina: number;
    area: string;
    turno: 'M' | 'N' | string;
    tipoMaquina: string;
    articuloSaliente: CambioArticuloRef;
    articuloEntrante: CambioArticuloRef;
    hora: string;
    horaEsDefault: boolean;
    motivoHora: string;
    tipoCambio: string;
    tiposCambioArray: string[];
    tipoEsInferidoSinMatch: boolean;
    duracionEsperadaMin: number;
    duracionTexto: string;
    duracionEsEstimada: boolean;
    motivoDuracion: string;
    muestrasHistorialBd: number;
    horasTejidoSaliente: number;
    horasTejidoEntranteDia: number;
}

export interface PendientePlanillaItem {
    key: string;
    codigoSusana: string;
    talle: string;
    color: string;
    descripcionPdf: string;
    maquinas: number[];
    areas: string[];
    estado: 'SIN_MATCH' | 'SIN_ESTRUCTURA' | 'ESTRUCTURA_INCOMPLETA';
    mensajeEstado: string;
    articuloMatcheado: {
        id: string;
        codigo: string;
        descripcion: string;
        etapa: string;
    } | null;
    componentesSinItem: string[];
    candidatosSugeridos: {
        id: string;
        codigo: string;
        descripcion: string;
        modelo: string | null;
        talle: string | null;
        variante: string | null;
        etapa: string | null;
        tieneEstructura: boolean;
    }[];
}

export interface ContextoPlantaProduccion {
    plantaId: string | null;
    plantaNombre: string;
    sector: string;
    plantasDisponibles: { id: string; nombre: string; ubicacion?: string | null }[];
    sectoresDisponibles: string[];
    ritmoDocenasPorHoraDefault: number;
    ritmoEsEstimadoGlobal: boolean;
}

export interface ProduccionParseResult {
    planillaId?: string;
    creadoEn?: string;
    fechas: string[];
    turnos: string[];
    areas: string[];
    archivosProcesados: { filename: string; entriesCount: number; machinesFound: number[] }[];
    contextoPlanta?: ContextoPlantaProduccion;
    listadoHilado?: HiladoPlanillaItem[];
    listadoCambios?: CambioPlanillaItem[];
    pendientesCompletar?: PendientePlanillaItem[];
    resumenAlertas: {
        totalArticulosDistintos: number;
        totalMaquinasAsignadas: number;
        articulosChequeados: number;
        articulosNoRevisados: number;
        articulosNoEncontrados: number;
        articulosSinEstructura?: number;
        articulosEstructuraIncompleta?: number;
        alertaGlobal: boolean;
        mensajeAlerta: string;
        // Nuevos KPIs de Producción, Picking y Compras
        totalMediasEstimadas?: number;
        totalParesEstimados?: number;
        totalDocenasEstimadas?: number;
        totalKilosHiladoDia?: number;
        totalConosDia?: number;
        totalCambiosProgramados08AM?: number;
        totalItemsReponerPicking?: number;
        totalItemsCriticosComprar?: number;
    };
    articulos: ArticuloProduccionSummary[];
    maquinas: ParsedMachineEntry[];
    colores: any[];
    materiales: MaterialAsignadoSummary[];
    hojaRepartidor: HojaRepartidorItem[];
    hojaPicking: HojaPickingItem[];
}

@Injectable()
export class OrdenesProduccionService implements OnModuleInit {
    private readonly logger = new Logger(OrdenesProduccionService.name);
    private schemaInitialized = false;

    constructor(
        @InjectRepository(ItemEntity)
        private readonly itemRepo: Repository<ItemEntity>,
        private readonly dataSource: DataSource,
    ) {}

    async onModuleInit() {
        try {
            await this.ensureSchemaAndSeed();
        } catch (err: any) {
            this.logger.warn(`Aviso al inicializar esquema de producción: ${err.message}`);
        }
    }

    /**
     * Crea las tablas de Producción Diaria y Stock/Pedidos de Artículos (separadas de Hilados/Insumos)
     * y aplica la migración 06_produccion_susi_y_limpieza.sql si aún no se aplicó.
     */
    async ensureSchemaAndSeed(): Promise<void> {
        if (this.schemaInitialized) return;

        await this.dataSource.query(`
            CREATE TABLE IF NOT EXISTS planillas_produccion_diaria (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                fecha VARCHAR(30) NOT NULL,
                archivos JSONB DEFAULT '[]'::jsonb,
                resumen JSONB DEFAULT '{}'::jsonb,
                datos_completos JSONB NOT NULL,
                creado_por VARCHAR(120),
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_planillas_prod_fecha ON planillas_produccion_diaria(fecha);

            CREATE TABLE IF NOT EXISTS depositos_articulos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                codigo VARCHAR(40) UNIQUE NOT NULL,
                nombre VARCHAR(120) NOT NULL,
                etapa_asociada VARCHAR(40) NOT NULL,
                descripcion TEXT,
                activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP DEFAULT NOW()
            );

            INSERT INTO depositos_articulos (codigo, nombre, etapa_asociada, descripcion) VALUES
                ('DEP-TEJ', 'Depósito Tejeduría (Medias Crudas)', 'TEJIDO', 'Almacén de medias salidas de máquinas tejedoras antes de costura'),
                ('DEP-COS', 'Depósito Costura / Plancha', 'COSTURA', 'Almacén en proceso de costura, cerrado de puntera y planchado'),
                ('DEP-TER', 'Depósito Producto Terminado (Empaque)', 'TERMINADO', 'Almacén de medias empaquetadas listas para expedición')
            ON CONFLICT (codigo) DO NOTHING;

            CREATE TABLE IF NOT EXISTS posiciones_articulos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deposito_id UUID NOT NULL REFERENCES depositos_articulos(id) ON DELETE CASCADE,
                codigo VARCHAR(50) NOT NULL,
                descripcion VARCHAR(150),
                capacidad_docenas NUMERIC(12,2),
                activo BOOLEAN DEFAULT TRUE,
                UNIQUE(deposito_id, codigo)
            );

            CREATE TABLE IF NOT EXISTS pedidos_produccion (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                numero_pedido VARCHAR(50) NOT NULL,
                cliente_marca VARCHAR(100),
                articulo_codigo VARCHAR(100) NOT NULL,
                codigo_susi VARCHAR(100),
                talle VARCHAR(30),
                color_descripcion VARCHAR(200),
                docenas_pedidas NUMERIC(12,2) NOT NULL DEFAULT 0,
                docenas_tejidas NUMERIC(12,2) NOT NULL DEFAULT 0,
                docenas_costuradas NUMERIC(12,2) NOT NULL DEFAULT 0,
                docenas_empaquetadas NUMERIC(12,2) NOT NULL DEFAULT 0,
                posicion_actual VARCHAR(80),
                prioridad VARCHAR(20) DEFAULT 'NORMAL',
                estado VARCHAR(30) DEFAULT 'EN_PROCESO',
                fecha_entrega VARCHAR(30),
                observaciones TEXT,
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            );

            ALTER TABLE IF EXISTS "positions" ADD COLUMN IF NOT EXISTS "categoriaPrincipal" varchar(255);
            ALTER TABLE IF EXISTS "positions" ADD COLUMN IF NOT EXISTS "categoriaSecundaria" varchar(255);
            ALTER TABLE IF EXISTS "articulos" ADD COLUMN IF NOT EXISTS "tipo" varchar(255);
            ALTER TABLE IF EXISTS "articulos" ADD COLUMN IF NOT EXISTS "origen" varchar(255);
            ALTER TABLE IF EXISTS "articulos" ADD COLUMN IF NOT EXISTS "estadoRevision" varchar(255);
            ALTER TABLE IF EXISTS "articulo_estructuras" ADD COLUMN IF NOT EXISTS "origen" varchar(255);
            ALTER TABLE IF EXISTS "articulo_estructuras" ADD COLUMN IF NOT EXISTS "estadoRevision" varchar(255);
            ALTER TABLE IF EXISTS "articulo_estructuras" ADD COLUMN IF NOT EXISTS "descripcionInsumo" varchar(255);

            CREATE TABLE IF NOT EXISTS articulo_alias_susana (
                codigo_susana VARCHAR(180) PRIMARY KEY,
                articulo_id UUID REFERENCES articulos(id) ON DELETE CASCADE,
                codigo_articulo VARCHAR(120) NOT NULL,
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS planilla_cambios_horarios (
                clave_cambio VARCHAR(180) PRIMARY KEY,
                fecha VARCHAR(30) NOT NULL,
                maquina INT NOT NULL,
                turno VARCHAR(10) NOT NULL,
                hora VARCHAR(10) NOT NULL,
                actualizado_en TIMESTAMP DEFAULT NOW()
            );

            INSERT INTO articulo_item_equivalencias ("articuloId", "codigoArticulo", "itemId", "codigoItem", "ordenPrioridad", "esPrincipal", "factorConversion", activo)
            SELECT a.id, a.codigo, i.id, i."codigoInterno", 2, false, 1.0, true
            FROM articulos a
            JOIN items i ON i."codigoInterno" IN ('L20150RZZ-blanca', 'L20150EU-blanca')
            WHERE a.codigo = 'L20150BLANCO'
              AND NOT EXISTS (
                  SELECT 1 FROM articulo_item_equivalencias e
                  WHERE e."codigoArticulo" = 'L20150BLANCO' AND e."itemId" = i.id
              );

            INSERT INTO articulo_item_equivalencias ("articuloId", "codigoArticulo", "itemId", "codigoItem", "ordenPrioridad", "esPrincipal", "factorConversion", activo)
            SELECT a.id, a.codigo, i.id, i."codigoInterno", 3, false, 1.0, true
            FROM articulos a
            JOIN items i ON i."codigoInterno" IN ('L20150RZZ-negra')
            WHERE a.codigo = 'L20150NEGRO'
              AND NOT EXISTS (
                  SELECT 1 FROM articulo_item_equivalencias e
                  WHERE e."codigoArticulo" = 'L20150NEGRO' AND e."itemId" = i.id
              );
        `);

        // Seed default article positions if empty
        const posCountRes = await this.dataSource.query(`SELECT COUNT(*)::int AS cnt FROM posiciones_articulos`);
        if ((posCountRes?.[0]?.cnt || 0) === 0) {
            await this.dataSource.query(`
                INSERT INTO posiciones_articulos (deposito_id, codigo, descripcion, capacidad_docenas)
                SELECT id, 'TEJ-CANASTO-01', 'Sector Canastos Tejeduría Área 1-2', 500 FROM depositos_articulos WHERE codigo = 'DEP-TEJ'
                UNION ALL
                SELECT id, 'TEJ-CANASTO-02', 'Sector Canastos Tejeduría Área 3-5', 500 FROM depositos_articulos WHERE codigo = 'DEP-TEJ'
                UNION ALL
                SELECT id, 'COS-MESA-01', 'Línea Costura Puntera y Plancha 1', 400 FROM depositos_articulos WHERE codigo = 'DEP-COS'
                UNION ALL
                SELECT id, 'TER-RACK-A1', 'Estantería Producto Terminado A1', 1000 FROM depositos_articulos WHERE codigo = 'DEP-TER'
                ON CONFLICT DO NOTHING;
            `);
        }

        // 1. Verificar y aplicar 05_cargar_falta_estructura.sql si faltan artículos de tejeduría (ej. Vans, New Balance)
        try {
            const check05 = await this.dataSource.query(
                `SELECT COUNT(*)::int AS cnt FROM articulos WHERE codigo = 'VNXRZZ95YCASA_M_B'`,
            );
            if ((check05?.[0]?.cnt || 0) === 0) {
                const paths05 = [
                    path.join(__dirname, 'sql', '05_cargar_falta_estructura.sql'),
                    path.join(process.cwd(), 'src', 'modules', 'quality', 'application', 'services', 'sql', '05_cargar_falta_estructura.sql'),
                    path.join(process.cwd(), 'dist', 'modules', 'quality', 'application', 'services', 'sql', '05_cargar_falta_estructura.sql'),
                    'c:\\Users\\Admin\\Desktop\\BDD fantasma\\05_cargar_falta_estructura.sql',
                ];
                for (const p of paths05) {
                    if (fs.existsSync(p)) {
                        this.logger.log(`Aplicando 05_cargar_falta_estructura.sql desde ${p}...`);
                        const sql = fs.readFileSync(p, 'utf-8');
                        await this.dataSource.query(sql);
                        this.logger.log('Migración 05_cargar_falta_estructura.sql aplicada con éxito.');
                        break;
                    }
                }
            }
        } catch (e: any) {
            this.logger.warn(`Aviso al verificar/aplicar 05_cargar_falta_estructura: ${e.message}`);
        }

        // 2. Verificar y aplicar 06_produccion_susi_y_limpieza.sql si falta mapeo de códigos Susi
        try {
            const check06 = await this.dataSource.query(
                `SELECT COUNT(*)::int AS cnt FROM articulos WHERE codigo = 'SX7664-905_L_U' AND "codigoSusi" IS NOT NULL`,
            );
            if ((check06?.[0]?.cnt || 0) === 0) {
                const paths06 = [
                    path.join(__dirname, 'sql', '06_produccion_susi_y_limpieza.sql'),
                    path.join(process.cwd(), 'src', 'modules', 'quality', 'application', 'services', 'sql', '06_produccion_susi_y_limpieza.sql'),
                    path.join(process.cwd(), 'dist', 'modules', 'quality', 'application', 'services', 'sql', '06_produccion_susi_y_limpieza.sql'),
                    'c:\\Users\\Admin\\Desktop\\BDD fantasma\\06_produccion_susi_y_limpieza.sql',
                ];
                for (const p of paths06) {
                    if (fs.existsSync(p)) {
                        this.logger.log(`Aplicando 06_produccion_susi_y_limpieza.sql desde ${p}...`);
                        const sql = fs.readFileSync(p, 'utf-8');
                        await this.dataSource.query(sql);
                        this.logger.log('Migración 06_produccion_susi_y_limpieza.sql aplicada con éxito.');
                        break;
                    }
                }
            }
        } catch (e: any) {
            this.logger.warn(`Aviso al verificar/aplicar 06_produccion_susi_y_limpieza: ${e.message}`);
        }

        // 3. Aplicar 07_articulos_tejeduria_susi.sql para asegurar la persistencia de los 330 artículos de tejeduría
        try {
            const check07 = await this.dataSource.query(
                `SELECT COUNT(*)::int AS cnt FROM articulos WHERE codigo = 'SX4705-101_M_B'`,
            );
            if ((check07?.[0]?.cnt || 0) === 0) {
                const paths07 = [
                    path.join(__dirname, 'sql', '07_articulos_tejeduria_susi.sql'),
                    path.join(process.cwd(), 'src', 'modules', 'quality', 'application', 'services', 'sql', '07_articulos_tejeduria_susi.sql'),
                    path.join(process.cwd(), 'dist', 'modules', 'quality', 'application', 'services', 'sql', '07_articulos_tejeduria_susi.sql'),
                ];
                for (const p of paths07) {
                    if (fs.existsSync(p)) {
                        this.logger.log(`Aplicando 07_articulos_tejeduria_susi.sql desde ${p}...`);
                        const sql = fs.readFileSync(p, 'utf-8');
                        await this.dataSource.query(sql);
                        this.logger.log('Migración 07_articulos_tejeduria_susi.sql aplicada con éxito.');
                        break;
                    }
                }
            }
        } catch (e: any) {
            this.logger.warn(`Aviso al aplicar 07_articulos_tejeduria_susi: ${e.message}`);
        }

        this.schemaInitialized = true;
    }

    /**
     * Obtiene la última planilla de producción diaria guardada sin necesidad de volver a subir los PDFs
     */
    async getUltimaPlanilla(plantaId?: string, sector?: string): Promise<ProduccionParseResult | null> {
        await this.ensureSchemaAndSeed();
        const rows = await this.dataSource.query(`
            SELECT id, fecha, archivos, creado_en, datos_completos
            FROM planillas_produccion_diaria
            ORDER BY actualizado_en DESC, creado_en DESC
            LIMIT 1
        `);
        if (!rows || rows.length === 0) return null;
        const row = rows[0];
        if (row.datos_completos && Array.isArray(row.datos_completos.maquinas) && row.datos_completos.maquinas.length > 0) {
            const rawMaquinas: ParsedMachineEntry[] = row.datos_completos.maquinas.map((m: any) => ({
                machine: m.machine,
                articleRaw: m.articleRaw,
                descRaw: m.descRaw,
                colorRaw: m.colorRaw,
                page: m.page || 1,
                file: m.file || '',
                date: m.date || '',
                shift: m.shift || 'M',
                area: m.area || '',
                talle: m.talle || '',
            }));
            return this.procesarPlanillaConEntradas(rawMaquinas, row.archivos || [], row.id, {
                plantaId,
                sector,
            });
        }
        const result: ProduccionParseResult = row.datos_completos;
        result.planillaId = row.id;
        result.creadoEn = row.creado_en;
        return result;
    }

    async listarPlanillas(): Promise<any[]> {
        await this.ensureSchemaAndSeed();
        return this.dataSource.query(`
            SELECT id, fecha, archivos, resumen, creado_por, creado_en, actualizado_en
            FROM planillas_produccion_diaria
            ORDER BY actualizado_en DESC, creado_en DESC
            LIMIT 30
        `);
    }

    async getPlanillaById(id: string, plantaId?: string, sector?: string): Promise<ProduccionParseResult | null> {
        await this.ensureSchemaAndSeed();
        const rows = await this.dataSource.query(
            `SELECT id, fecha, archivos, creado_en, datos_completos FROM planillas_produccion_diaria WHERE id = $1`,
            [id],
        );
        if (!rows || rows.length === 0) return null;
        const row = rows[0];
        if (row.datos_completos && Array.isArray(row.datos_completos.maquinas) && row.datos_completos.maquinas.length > 0) {
            const rawMaquinas: ParsedMachineEntry[] = row.datos_completos.maquinas.map((m: any) => ({
                machine: m.machine,
                articleRaw: m.articleRaw,
                descRaw: m.descRaw,
                colorRaw: m.colorRaw,
                page: m.page || 1,
                file: m.file || '',
                date: m.date || '',
                shift: m.shift || 'M',
                area: m.area || '',
                talle: m.talle || '',
            }));
            return this.procesarPlanillaConEntradas(rawMaquinas, row.archivos || [], row.id, {
                plantaId,
                sector,
            });
        }
        const result: ProduccionParseResult = row.datos_completos;
        result.planillaId = row.id;
        result.creadoEn = row.creado_en;
        return result;
    }

    async limpiarPlanillas(): Promise<{ deleted: boolean; message: string }> {
        await this.ensureSchemaAndSeed();
        await this.dataSource.query(`DELETE FROM planillas_produccion_diaria`);
        return { deleted: true, message: 'Se eliminaron todas las planillas cargadas previamente.' };
    }

    async eliminarPlanilla(id: string): Promise<{ deleted: boolean; message: string }> {
        await this.ensureSchemaAndSeed();
        await this.dataSource.query(`DELETE FROM planillas_produccion_diaria WHERE id = $1`, [id]);
        return { deleted: true, message: `Planilla ${id} eliminada.` };
    }

    /**
     * Vincula un código de Susana (PDF) con un artículo de la BD, persiste el alias permanentemente
     * y devuelve la planilla recalculada al instante.
     */
    async vincularCodigoSusana(dto: {
        codigoSusana: string;
        articuloId: string;
        planillaId?: string;
        plantaId?: string;
        sector?: string;
    }): Promise<ProduccionParseResult | null> {
        await this.ensureSchemaAndSeed();
        const susiClean = (dto.codigoSusana || '').trim().toUpperCase().replace(/\s+/g, ' ');
        if (!susiClean || !dto.articuloId) {
            throw new Error('Debes indicar el código de Susana y el artículo de destino.');
        }

        const artRows = await this.dataSource.query(
            `SELECT id, codigo, "codigoSusi" FROM articulos WHERE id = $1 LIMIT 1`,
            [dto.articuloId],
        );
        if (!artRows || artRows.length === 0) {
            throw new Error('El artículo seleccionado no existe en la base de datos.');
        }
        const targetArt = artRows[0];

        await this.dataSource.query(
            `
            INSERT INTO articulo_alias_susana (codigo_susana, articulo_id, codigo_articulo, creado_en, actualizado_en)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (codigo_susana) DO UPDATE
            SET articulo_id = EXCLUDED.articulo_id,
                codigo_articulo = EXCLUDED.codigo_articulo,
                actualizado_en = NOW()
            `,
            [susiClean, targetArt.id, targetArt.codigo],
        );

        if (!targetArt.codigoSusi) {
            await this.dataSource.query(
                `UPDATE articulos SET "codigoSusi" = $1, "updatedAt" = NOW() WHERE id = $2`,
                [susiClean, targetArt.id],
            );
        }

        return this.recalcularPlanilla(dto.planillaId, dto.plantaId, dto.sector);
    }

    /**
     * Guarda un horario personalizado para un cambio de máquina y recalcula la planilla
     */
    async actualizarHoraCambio(dto: {
        fecha: string;
        maquina: number;
        turno: string;
        hora: string;
        planillaId?: string;
        plantaId?: string;
        sector?: string;
    }): Promise<ProduccionParseResult | null> {
        await this.ensureSchemaAndSeed();
        const fechaClean = (dto.fecha || 'HOY').trim();
        const maquinaNum = Number(dto.maquina);
        const turnoClean = (dto.turno || 'M').trim().toUpperCase();
        const horaClean = (dto.hora || '07:00').trim();
        const clave = `${fechaClean}__${maquinaNum}__${turnoClean}`;

        await this.dataSource.query(
            `
            INSERT INTO planilla_cambios_horarios (clave_cambio, fecha, maquina, turno, hora, actualizado_en)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (clave_cambio) DO UPDATE
            SET hora = EXCLUDED.hora,
                actualizado_en = NOW()
            `,
            [clave, fechaClean, maquinaNum, turnoClean, horaClean],
        );

        return this.recalcularPlanilla(dto.planillaId, dto.plantaId, dto.sector);
    }

    /**
     * Lista artículos del catálogo para el selector de matcheo rápido, indicando cuáles ya tienen estructura
     */
    async getCatalogoParaMatcheo(search?: string, etapa?: string): Promise<any[]> {
        await this.ensureSchemaAndSeed();
        const q = (search || '').trim();
        const params: any[] = [];
        let where = `WHERE (a.activo = true OR a.activo IS NULL)`;

        if (etapa && etapa !== 'TODOS') {
            params.push(etapa.trim().toUpperCase());
            where += ` AND a.etapa = $${params.length}`;
        }

        if (q) {
            params.push(`%${q}%`);
            where += ` AND (a.codigo ILIKE $${params.length} OR a.descripcion ILIKE $${params.length} OR COALESCE(a.modelo, '') ILIKE $${params.length} OR COALESCE(a."codigoSusi", '') ILIKE $${params.length})`;
        }

        const rows = await this.dataSource.query(
            `
            SELECT
                a.id,
                a.codigo,
                a.descripcion,
                a.marca,
                a.modelo,
                a.talle,
                a.variante,
                a.etapa,
                a."codigoSusi",
                COUNT(e.id)::int AS "componentesCount"
            FROM articulos a
            LEFT JOIN articulo_estructuras e
                ON UPPER(TRIM(e."codigoPadre")) = UPPER(TRIM(a.codigo))
                AND (e.activo = true OR e.activo IS NULL)
            ${where}
            GROUP BY a.id, a.codigo, a.descripcion, a.marca, a.modelo, a.talle, a.variante, a.etapa, a."codigoSusi"
            ORDER BY
                CASE WHEN a.etapa = 'TEJIDO' THEN 0 ELSE 1 END,
                CASE WHEN COUNT(e.id) > 0 THEN 0 ELSE 1 END,
                a.codigo ASC
            LIMIT 80
            `,
            params,
        );

        return rows.map((r: any) => ({
            id: r.id,
            codigo: r.codigo,
            descripcion: r.descripcion,
            marca: r.marca,
            modelo: r.modelo,
            talle: r.talle,
            variante: r.variante,
            etapa: r.etapa,
            codigoSusi: r.codigoSusi,
            componentesCount: Number(r.componentesCount) || 0,
            tieneEstructura: (Number(r.componentesCount) || 0) > 0,
        }));
    }

    /**
     * Parsea los PDFs de producción diaria de Susana, cruza los artículos de TEJIDO,
     * calcula horas reales de tejido sobre las 24h del día restando el tiempo de cambio según machine_changes,
     * explota los hilados a razón de 0,8 docenas/hora base, calcula conos según peso por tipo de material
     * y cruza con Stock y Pasillo de Picking del depósito hilado (excluyendo pilar).
     */
    async parseOrdenesFromBuffers(
        files: { buffer: Buffer; originalname: string }[],
        options?: { plantaId?: string; sector?: string; fechaFiltro?: string },
    ): Promise<ProduccionParseResult> {
        await this.ensureSchemaAndSeed();

        const allRawEntries: ParsedMachineEntry[] = [];
        const archivosProcesados: { filename: string; entriesCount: number; machinesFound: number[] }[] = [];

        for (const file of files) {
            try {
                const entries = await this.extractPdfEntries(file.buffer, file.originalname);
                allRawEntries.push(...entries);
                archivosProcesados.push({
                    filename: file.originalname,
                    entriesCount: entries.length,
                    machinesFound: Array.from(new Set(entries.map((e) => e.machine))).sort((a, b) => a - b),
                });
            } catch (err: any) {
                this.logger.error(`Error procesando archivo ${file.originalname}: ${err.message}`, err.stack);
            }
        }

        return this.procesarPlanillaConEntradas(allRawEntries, archivosProcesados, undefined, options);
    }

    /**
     * Recalcula la planilla de producción diaria utilizando las recetas técnicas actuales de articulo_estructuras,
     * alias de Susana y saldos de stock vigentes.
     */
    async recalcularPlanilla(
        id?: string,
        plantaId?: string,
        sector?: string,
    ): Promise<ProduccionParseResult | null> {
        await this.ensureSchemaAndSeed();
        let row: any = null;
        if (id) {
            const rows = await this.dataSource.query(
                `SELECT id, fecha, archivos, datos_completos FROM planillas_produccion_diaria WHERE id = $1`,
                [id],
            );
            if (rows && rows.length > 0) row = rows[0];
        } else {
            const rows = await this.dataSource.query(
                `SELECT id, fecha, archivos, datos_completos FROM planillas_produccion_diaria ORDER BY actualizado_en DESC, creado_en DESC LIMIT 1`,
            );
            if (rows && rows.length > 0) row = rows[0];
        }

        if (!row || !row.datos_completos || !row.datos_completos.maquinas) {
            return null;
        }

        const rawMaquinas: ParsedMachineEntry[] = (row.datos_completos.maquinas || []).map((m: any) => ({
            machine: m.machine,
            articleRaw: m.articleRaw,
            descRaw: m.descRaw,
            colorRaw: m.colorRaw,
            page: m.page || 1,
            file: m.file || '',
            date: m.date || '',
            shift: m.shift || 'M',
            area: m.area || '',
            talle: m.talle || '',
        }));

        const archivos = row.archivos || [];
        return this.procesarPlanillaConEntradas(rawMaquinas, archivos, row.id, { plantaId, sector });
    }

    /**
     * Determina el peso de cono según el ítem en BD o las reglas por tipo de hilado:
     * Algodón = 1,0 kg | Nylon = 0,7 kg | Lycra = 3,5 kg | Goma = 0,5 kg
     */
    private resolvePesoCono(
        item: ItemEntity | null | undefined,
        codigoComponente?: string,
        descripcion?: string,
    ): {
        pesoConoKg: number;
        esEstimado: boolean;
        tipoMaterialCono: 'ALGODON' | 'NYLON' | 'LYCRA' | 'GOMA' | 'OTRO';
        motivoPesoCono: string;
    } {
        const dbWeight = Number(item?.pesoConoKg);
        const cat = (item?.category?.nombre || '').trim().toUpperCase();
        const code = (item?.codigoInterno || codigoComponente || '').trim().toUpperCase();
        const desc = (item?.descripcion || descripcion || '').trim().toUpperCase();

        let tipo: 'ALGODON' | 'NYLON' | 'LYCRA' | 'GOMA' | 'OTRO' = 'OTRO';
        let defaultKg = 1.0;

        if (
            cat.includes('GOMA') ||
            code.startsWith('G140') ||
            code.startsWith('140/') ||
            code.startsWith('L140') ||
            desc.includes('GOMA')
        ) {
            tipo = 'GOMA';
            defaultKg = 0.5;
        } else if (
            cat.includes('LYCRA') ||
            code.startsWith('L20') ||
            code.startsWith('L40') ||
            code.startsWith('L70') ||
            desc.includes('LYCRA')
        ) {
            tipo = 'LYCRA';
            defaultKg = 3.5;
        } else if (
            cat.includes('NYLON') ||
            cat.includes('POLIESTER') ||
            cat.includes('POLYSOFT') ||
            code.startsWith('N70') ||
            code.startsWith('N100') ||
            code.startsWith('N40') ||
            code.startsWith('P78') ||
            desc.includes('NYLON') ||
            desc.includes('POLIESTER')
        ) {
            tipo = 'NYLON';
            defaultKg = 0.7;
        } else if (
            cat.includes('ALGODON') ||
            code.startsWith('A16') ||
            code.startsWith('A24') ||
            code.startsWith('A20') ||
            code.startsWith('A8') ||
            code.startsWith('A30') ||
            desc.includes('ALGODON')
        ) {
            tipo = 'ALGODON';
            defaultKg = 1.0;
        }

        if (!isNaN(dbWeight) && dbWeight > 0) {
            return {
                pesoConoKg: dbWeight,
                esEstimado: false,
                tipoMaterialCono: tipo,
                motivoPesoCono: `Peso de cono cargado en la ficha del ítem en BD (${dbWeight} kg)`,
            };
        }

        const labelTipo =
            tipo === 'ALGODON'
                ? 'Algodón (1,0 kg por cono)'
                : tipo === 'NYLON'
                  ? 'Nylon / Poliéster (0,7 kg por cono)'
                  : tipo === 'LYCRA'
                    ? 'Lycra (3,5 kg por cono)'
                    : tipo === 'GOMA'
                      ? 'Goma (0,5 kg por cono)'
                      : 'Estándar (1,0 kg por cono)';

        return {
            pesoConoKg: defaultKg,
            esEstimado: true,
            tipoMaterialCono: tipo,
            motivoPesoCono: `Dato estimado por tipo de hilado: ${labelTipo}. Cuando el ítem tenga su peso en la BD se tomará automáticamente.`,
        };
    }

    /**
     * Convierte "HH:MM" en horas transcurridas desde el inicio del turno (06:00 para M, 18:00 para N)
     */
    private computeHoursBeforeChange(horaStr: string, shift: string): number {
        const match = (horaStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return shift === 'N' ? 11 : 1;
        const hh = Math.min(23, Math.max(0, parseInt(match[1], 10)));
        const mm = Math.min(59, Math.max(0, parseInt(match[2], 10)));
        const decimalHour = hh + mm / 60;

        if (shift === 'N') {
            // Turno Noche: 18:00 a 06:00
            let diff = decimalHour >= 18 ? decimalHour - 18 : decimalHour + 6;
            if (diff <= 0 || diff >= 12) diff = 11; // Si dice 06:00 en turno N, teje 11h antes del cambio final
            return Math.round(diff * 100) / 100;
        } else {
            // Turno Mañana: 06:00 a 18:00 (default 07:00 => 1h)
            let diff = decimalHour - 6;
            if (diff <= 0) diff = 1;
            if (diff > 11.5) diff = 11.5;
            return Math.round(diff * 100) / 100;
        }
    }

    /**
     * Ejecuta el cálculo completo de la Planilla del Día:
     * - Filtra máquinas por Planta (Der Will por defecto) y Sector (TEJEDURIA por defecto)
     * - Calcula los cambios del día, su tipo y su duración esperada desde machine_changes
     * - Resta el tiempo del cambio a las 24 horas del día y calcula docenas a razón de 0,8 doc/h base
     * - Explota los hilados, calcula conos según peso de cono (1kg / 0,7kg / 3,5kg / 0,5kg)
     * - Cruza con Stock y Pasillo de Picking del depósito hilado (excluyendo depósito pilar)
     */
    async procesarPlanillaConEntradas(
        allRawEntriesInput: ParsedMachineEntry[],
        archivosProcesados: any[] = [],
        existingId?: string,
        options?: { plantaId?: string; sector?: string; fechaFiltro?: string },
    ): Promise<ProduccionParseResult> {
        await this.ensureSchemaAndSeed();

        // 1. Lectura en bloque desde la BD
        const [
            rawPlants,
            rawArticulos,
            rawEstructuras,
            rawMachineTimes,
            rawEquivalencias,
            rawMachines,
            rawMachineChanges,
            allItems,
            rawPositions,
            rawStockBalances,
            rawCustomAliases,
            rawHoraOverrides,
        ] = await Promise.all([
            this.dataSource.query(`SELECT id, name, location FROM plants ORDER BY name ASC`),
            this.dataSource.query(`
                SELECT id, codigo, descripcion, "unidadMedida", marca, modelo, talle, variante, etapa, familia, "codigoSusi", estado
                FROM articulos
                WHERE activo = true OR activo IS NULL
            `),
            this.dataSource.query(`
                SELECT "codigoPadre", "codigoComponente", cantidad, "descripcionInsumo"
                FROM articulo_estructuras
                WHERE activo = true OR activo IS NULL
            `),
            this.dataSource.query(`
                SELECT amt."articuloId", amt."machineTypeId", amt."cycleTimeSeconds", amt.preferida, amt."timeSource", amt.status
                FROM articulo_machine_types amt
            `),
            this.dataSource.query(`
                SELECT "codigoArticulo", "itemId", "codigoItem", "ordenPrioridad", "esPrincipal", "factorConversion"
                FROM articulo_item_equivalencias
                WHERE activo = true
                ORDER BY "esPrincipal" DESC, "ordenPrioridad" ASC
            `),
            this.dataSource.query(`
                SELECT m.id, m.number, m."codigoInterno", m.nombre, m.status, m."plantId", p.name AS "plantName",
                       m."typeId", mt.name AS "machineTypeName", mt.category AS "machineCategory"
                FROM machines m
                LEFT JOIN plants p ON p.id = m."plantId"
                LEFT JOIN machine_types mt ON mt.id = m."typeId"
            `),
            this.dataSource.query(`
                SELECT "machineId", "changeTypes", "startTime", "endTime"
                FROM machine_changes
                WHERE "endTime" IS NOT NULL AND "endTime" > "startTime"
            `),
            this.itemRepo.find({ relations: ['category', 'supplier'] }),
            this.dataSource.query(`
                SELECT p.id, p."depositoId", p.codigo, p.categoria, p."categoriaPrincipal", p."categoriaSecundaria", d.nombre AS "depositoNombre"
                FROM positions p
                LEFT JOIN depots d ON d.id = p."depositoId"
                WHERE p.activo = true
            `),
            this.dataSource.query(`
                SELECT sb."itemId", sb."posicionId", sb."depositoId", sb."qtyPrincipal",
                       p.codigo AS "posicionCodigo", p.categoria AS "posicionCategoria",
                       d.nombre AS "depositoNombre", b."lotNumber" AS "partida"
                FROM stock_balance sb
                LEFT JOIN positions p ON p.id = sb."posicionId"
                LEFT JOIN depots d ON d.id = sb."depositoId"
                LEFT JOIN batches b ON b.id = sb."lotId"
                WHERE sb."qtyPrincipal" > 0
            `),
            this.dataSource.query(`SELECT codigo_susana, articulo_id, codigo_articulo FROM articulo_alias_susana`),
            this.dataSource.query(`SELECT clave_cambio, hora FROM planilla_cambios_horarios`),
        ]);

        // Resolver Planta (por defecto Der Will) y Sector (por defecto TEJEDURIA)
        const plantasDisponibles = (rawPlants || []).map((p: any) => ({
            id: p.id,
            nombre: p.name,
            ubicacion: p.location,
        }));
        const derWillPlant =
            plantasDisponibles.find((p: any) => (p.nombre || '').toUpperCase().includes('DER WILL')) ||
            plantasDisponibles[0] || { id: null, nombre: 'Der Will' };

        const selectedPlant =
            (options?.plantaId &&
                plantasDisponibles.find(
                    (p: any) => p.id === options.plantaId || (p.nombre || '').toUpperCase() === options.plantaId!.toUpperCase(),
                )) ||
            derWillPlant;

        const sectoresSet = new Set<string>(['TEJEDURIA']);
        for (const m of rawMachines) {
            if (m.machineCategory) sectoresSet.add(String(m.machineCategory).toUpperCase());
        }
        const selectedSector = (options?.sector || 'TEJEDURIA').trim().toUpperCase();

        // Clonar entradas para no mutar referencias previas
        const allRawEntries: ParsedMachineEntry[] = allRawEntriesInput
            .filter((e) => !options?.fechaFiltro || e.date === options.fechaFiltro)
            .map((e) => ({ ...e }));

        // Indexar horarios personalizados de cambios
        const horaOverrideMap = new Map<string, string>();
        for (const ho of rawHoraOverrides || []) {
            if (ho.clave_cambio && ho.hora) {
                horaOverrideMap.set(ho.clave_cambio, ho.hora);
            }
        }

        // Indexar alias guardados en BD por el usuario
        const customAliasMap = new Map<string, string>();
        for (const ca of rawCustomAliases || []) {
            if (ca.codigo_susana && ca.codigo_articulo) {
                customAliasMap.set(
                    String(ca.codigo_susana).trim().toUpperCase().replace(/\s+/g, ' '),
                    String(ca.codigo_articulo).trim().toUpperCase(),
                );
            }
        }

        // Indexar Items de Inventario (Hilados/Insumos)
        const itemById = new Map<string, ItemEntity>();
        const itemByCode = new Map<string, ItemEntity>();
        for (const it of allItems) {
            itemById.set(it.id, it);
            if (it.codigoInterno) {
                itemByCode.set(it.codigoInterno.trim().toUpperCase(), it);
            }
        }

        // Indexar Posiciones de Picking del depósito hilado (excluyendo depósito pilar)
        const pickingPositionsByCategory = new Map<string, string[]>();
        const allPickingPositions: string[] = [];
        for (const pos of rawPositions) {
            const depName = (pos.depositoNombre || '').trim().toLowerCase();
            if (depName === 'pilar') continue; // Excluir depósito Pilar

            const catPos = (pos.categoria || '').trim().toUpperCase();
            if (catPos === 'PICKING' && (depName === 'hilado' || !depName)) {
                allPickingPositions.push(pos.codigo);
                for (const pref of [pos.categoriaPrincipal, pos.categoriaSecundaria]) {
                    if (pref) {
                        const key = pref.trim().toUpperCase();
                        if (!pickingPositionsByCategory.has(key)) pickingPositionsByCategory.set(key, []);
                        const arr = pickingPositionsByCategory.get(key)!;
                        if (!arr.includes(pos.codigo)) arr.push(pos.codigo);
                    }
                }
            }
        }

        // Indexar Stock en Pasillo de Picking vs Stock en Depósito (excluyendo depósito 'pilar')
        // Nota confirmada: Cuarentena se cuenta dentro del stock del depósito hilado.
        const stockByItemId = new Map<
            string,
            {
                pickingKg: number;
                reservaKg: number;
                totalDepositoKg: number;
                pickingPositions: Set<string>;
                reservaPositions: Set<string>;
                lots: { posicionCodigo: string; posicionCategoria: string; partida: string | null; qtyPrincipal: number }[];
            }
        >();
        for (const sb of rawStockBalances) {
            const depName = (sb.depositoNombre || '').trim().toLowerCase();
            if (depName === 'pilar') continue; // Excluir depósito Pilar (no tenemos fácil acceso a esa mercadería)

            const itemId = sb.itemId;
            const qty = Number(sb.qtyPrincipal) || 0;
            if (!itemId || qty <= 0) continue;
            if (!stockByItemId.has(itemId)) {
                stockByItemId.set(itemId, {
                    pickingKg: 0,
                    reservaKg: 0,
                    totalDepositoKg: 0,
                    pickingPositions: new Set(),
                    reservaPositions: new Set(),
                    lots: [],
                });
            }
            const rec = stockByItemId.get(itemId)!;
            const isPicking = (sb.posicionCategoria || '').trim().toUpperCase() === 'PICKING';
            rec.totalDepositoKg += qty;
            if (isPicking) {
                rec.pickingKg += qty;
                if (sb.posicionCodigo) rec.pickingPositions.add(sb.posicionCodigo);
            } else {
                rec.reservaKg += qty;
                if (sb.posicionCodigo) rec.reservaPositions.add(sb.posicionCodigo);
            }
            rec.lots.push({
                posicionCodigo: sb.posicionCodigo || 'S/P',
                posicionCategoria: sb.posicionCategoria || '',
                partida: sb.partida || null,
                qtyPrincipal: qty,
            });
        }

        for (const rec of stockByItemId.values()) {
            rec.lots.sort((a, b) => {
                const numA = parseInt(String(a.partida || '').replace(/\D/g, ''), 10);
                const numB = parseInt(String(b.partida || '').replace(/\D/g, ''), 10);
                if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                    return numA - numB;
                }
                return String(a.partida || '').localeCompare(String(b.partida || ''), undefined, { numeric: true });
            });
        }

        // Indexar Equivalencias (Componente BOM -> lista ordenada de opciones)
        const equivListByComp = new Map<
            string,
            { item: ItemEntity; ordenPrioridad: number; esPrincipal: boolean; factorConversion: number }[]
        >();
        for (const eq of rawEquivalencias) {
            const compCode = (eq.codigoArticulo || '').trim().toUpperCase();
            if (!compCode) continue;
            const foundItem = itemById.get(eq.itemId) || itemByCode.get((eq.codigoItem || '').trim().toUpperCase());
            if (foundItem) {
                if (!equivListByComp.has(compCode)) equivListByComp.set(compCode, []);
                equivListByComp.get(compCode)!.push({
                    item: foundItem,
                    ordenPrioridad: Number(eq.ordenPrioridad || 1),
                    esPrincipal: Boolean(eq.esPrincipal),
                    factorConversion: Number(eq.factorConversion || 1),
                });
            }
        }
        for (const list of equivListByComp.values()) {
            list.sort((a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0) || a.ordenPrioridad - b.ordenPrioridad);
        }

        const resolveBestItemForComp = (compCode: string) => {
            const list = equivListByComp.get(compCode);
            if (list && list.length > 0) {
                const principal = list[0];
                const stockPrincipal = stockByItemId.get(principal.item.id);
                const totalPrincipal = stockPrincipal?.totalDepositoKg || 0;

                if (totalPrincipal > 0) {
                    return {
                        item: principal.item,
                        esSustituto: false,
                        prioridad: principal.ordenPrioridad,
                        sustitutoMotivo: null as string | null,
                    };
                }

                for (let i = 1; i < list.length; i++) {
                    const cand = list[i];
                    const stockCand = stockByItemId.get(cand.item.id);
                    const totalCand = stockCand?.totalDepositoKg || 0;
                    if (totalCand > 0) {
                        return {
                            item: cand.item,
                            esSustituto: true,
                            prioridad: cand.ordenPrioridad,
                            sustitutoMotivo: `Opción ${cand.ordenPrioridad} (${cand.item.supplier?.name || cand.item.codigoInterno}): Principal (${principal.item.supplier?.name || principal.item.codigoInterno}) sin stock`,
                        };
                    }
                }

                return {
                    item: principal.item,
                    esSustituto: false,
                    prioridad: principal.ordenPrioridad,
                    sustitutoMotivo: null as string | null,
                };
            }

            const direct = itemByCode.get(compCode) || null;
            return {
                item: direct,
                esSustituto: false,
                prioridad: 1,
                sustitutoMotivo: null as string | null,
            };
        };

        // Indexar Máquinas filtrando por Planta seleccionada (Der Will) y Sector (TEJEDURIA)
        const machineByNumber = new Map<
            number,
            { id: string; number: number; typeId: string; machineTypeName: string; status: string; plantName: string }
        >();
        for (const m of rawMachines) {
            const num = Number(m.number);
            if (isNaN(num) || num <= 0) continue;

            const matchesPlant =
                !selectedPlant?.id ||
                m.plantId === selectedPlant.id ||
                (m.plantName || '').toUpperCase() === (selectedPlant.nombre || '').toUpperCase();
            const matchesSector =
                !selectedSector ||
                !m.machineCategory ||
                String(m.machineCategory).toUpperCase() === selectedSector;

            if (matchesPlant && matchesSector) {
                machineByNumber.set(num, {
                    id: m.id,
                    number: num,
                    typeId: m.typeId,
                    machineTypeName: m.machineTypeName || 'Lonati Tejeduría',
                    status: m.status || 'ACTIVA',
                    plantName: m.plantName || selectedPlant?.nombre || 'Der Will',
                });
            } else if (!machineByNumber.has(num)) {
                // Fallback solo si no existiera en la planta seleccionada
                machineByNumber.set(num, {
                    id: m.id,
                    number: num,
                    typeId: m.typeId,
                    machineTypeName: m.machineTypeName || 'Lonati Tejeduría',
                    status: m.status || 'ACTIVA',
                    plantName: m.plantName || 'Der Will',
                });
            }
        }

        // Calcular promedios históricos de cambios desde machine_changes en la BD
        const changeDurationsByMachineAndType = new Map<string, number[]>();
        const changeDurationsByType = new Map<string, number[]>();
        for (const mc of rawMachineChanges) {
            const start = new Date(mc.startTime).getTime();
            const end = new Date(mc.endTime).getTime();
            const diffHours = (end - start) / (1000 * 3600);
            if (diffHours <= 0.03 || diffHours > 8) continue; // ignorar outliers fuera de rango
            const typesArr: string[] = Array.isArray(mc.changeTypes) ? mc.changeTypes : [];
            const cleanTypes = typesArr
                .map((t) => String(t).trim().toUpperCase())
                .filter((t) => ['ARTICULO', 'TALLE', 'COLOR'].includes(t))
                .sort();
            const typeKey = cleanTypes.join('+') || 'ARTICULO';

            const mKey = `${mc.machineId}__${typeKey}`;
            if (!changeDurationsByMachineAndType.has(mKey)) changeDurationsByMachineAndType.set(mKey, []);
            changeDurationsByMachineAndType.get(mKey)!.push(diffHours);

            if (!changeDurationsByType.has(typeKey)) changeDurationsByType.set(typeKey, []);
            changeDurationsByType.get(typeKey)!.push(diffHours);
        }

        // Ritmo base de planta confirmado: 0,8 docenas por hora = 19,2 medias/hora = 187,5 segundos por media
        const DEFAULT_DOCENAS_POR_HORA = 0.8;
        const DEFAULT_CYCLE_SEC_PLANTA = 3600 / (DEFAULT_DOCENAS_POR_HORA * 24); // 187.5 seg/media

        // Indexar Tiempos por Artículo y MachineType (solo si son medidos reales y distintos del placeholder 95)
        const timesByArticuloId = new Map<string, { byType: Map<string, number>; preferred: number; isMeasured: boolean }>();
        for (const amt of rawMachineTimes) {
            const sec = Number(amt.cycleTimeSeconds);
            if (!sec || sec <= 0) continue;
            const isPlaceholder95 = Math.abs(sec - 95) < 0.1 && (amt.status === 'ESTIMADO' || amt.timeSource === 'ESTIMADO');
            const effectiveSec = isPlaceholder95 ? DEFAULT_CYCLE_SEC_PLANTA : sec;
            const isMeasured = !isPlaceholder95 && amt.status !== 'ESTIMADO';

            if (!timesByArticuloId.has(amt.articuloId)) {
                timesByArticuloId.set(amt.articuloId, { byType: new Map(), preferred: effectiveSec, isMeasured });
            }
            const tObj = timesByArticuloId.get(amt.articuloId)!;
            tObj.byType.set(amt.machineTypeId, effectiveSec);
            if (amt.preferida) {
                tObj.preferred = effectiveSec;
                tObj.isMeasured = isMeasured;
            }
        }

        // Indexar BOM (articulo_estructuras) por codigoPadre
        const bomByPadre = new Map<
            string,
            { codigoComponente: string; descripcionInsumo: string; cantidad: number }[]
        >();
        for (const est of rawEstructuras) {
            const padre = (est.codigoPadre || '').trim().toUpperCase();
            const comp = (est.codigoComponente || '').trim().toUpperCase();
            if (!padre || !comp) continue;
            if (!bomByPadre.has(padre)) bomByPadre.set(padre, []);
            bomByPadre.get(padre)!.push({
                codigoComponente: comp,
                descripcionInsumo: est.descripcionInsumo || comp,
                cantidad: Number(est.cantidad) || 0,
            });
        }

        // Construir Catálogo de Artículos (priorizando etapa TEJIDO)
        const artByCode = new Map<string, ArticuloCatalogItem>();
        const artBySusi = new Map<string, ArticuloCatalogItem>();
        const tejidoByModelSize = new Map<string, ArticuloCatalogItem[]>();
        const tejidoByModel = new Map<string, ArticuloCatalogItem[]>();
        const allByModelSize = new Map<string, ArticuloCatalogItem[]>();
        const allByModel = new Map<string, ArticuloCatalogItem[]>();

        for (const raw of rawArticulos) {
            const codeUpper = (raw.codigo || '').trim().toUpperCase();
            const timeInfo = timesByArticuloId.get(raw.id);
            const rawBoms = this.getLeafBom(codeUpper, bomByPadre);

            const bomRefs = rawBoms.map((b) => {
                const res = resolveBestItemForComp(b.codigoComponente);
                const matchedItem = res.item;
                return {
                    codigoComponente: b.codigoComponente,
                    descripcionComponente: matchedItem?.descripcion || b.descripcionInsumo || b.codigoComponente,
                    cantidadKgPorDocena: b.cantidad,
                    item: matchedItem,
                    esSustituto: res.esSustituto,
                    prioridad: res.prioridad,
                    sustitutoMotivo: res.sustitutoMotivo,
                };
            });

            const hasCompleteBom = bomRefs.length > 0 && bomRefs.every((b) => !!b.item);
            const estadoRev =
                bomRefs.length > 0 && hasCompleteBom
                    ? EstadoRevisionArticulo.CHEQUEADO
                    : bomRefs.length > 0
                      ? EstadoRevisionArticulo.INCOMPLETO
                      : EstadoRevisionArticulo.PENDIENTE;

            const catalogItem: ArticuloCatalogItem = {
                id: raw.id,
                codigo: raw.codigo.trim(),
                descripcion: raw.descripcion || raw.codigo,
                marca: raw.marca,
                modelo: raw.modelo,
                talle: raw.talle,
                variante: raw.variante,
                etapa: raw.etapa,
                familia: raw.familia,
                codigoSusi: raw.codigoSusi,
                estado: raw.estado,
                estadoRevision: estadoRev,
                cycleTimeByMachineType: timeInfo?.byType || new Map(),
                defaultCycleTimeSeconds: timeInfo?.preferred || DEFAULT_CYCLE_SEC_PLANTA,
                bomRefs,
            };

            artByCode.set(codeUpper, catalogItem);

            if (raw.codigoSusi) {
                const susiKey = raw.codigoSusi.trim().toUpperCase().replace(/\s+/g, ' ');
                // Priorizar TEJIDO si hubiera más de uno
                if (!artBySusi.has(susiKey) || raw.etapa === 'TEJIDO') {
                    artBySusi.set(susiKey, catalogItem);
                }
            }

            const parts = codeUpper.split('_');
            const model = (raw.modelo || parts[0] || '').trim().toUpperCase();
            const size = (raw.talle || parts[1] || '').trim().toUpperCase();

            if (raw.etapa === 'TEJIDO') {
                if (model && size) {
                    const msKey = `${model}__${size}`;
                    if (!tejidoByModelSize.has(msKey)) tejidoByModelSize.set(msKey, []);
                    tejidoByModelSize.get(msKey)!.push(catalogItem);
                }
                if (model) {
                    if (!tejidoByModel.has(model)) tejidoByModel.set(model, []);
                    tejidoByModel.get(model)!.push(catalogItem);
                }
            }

            if (model && size) {
                const msKey = `${model}__${size}`;
                if (!allByModelSize.has(msKey)) allByModelSize.set(msKey, []);
                allByModelSize.get(msKey)!.push(catalogItem);
            }
            if (model) {
                if (!allByModel.has(model)) allByModel.set(model, []);
                allByModel.get(model)!.push(catalogItem);
            }
        }

        // Aplicar también los alias personalizados guardados en articulo_alias_susana
        for (const [susiKey, targetCodeUpper] of customAliasMap.entries()) {
            const targetArt = artByCode.get(targetCodeUpper);
            if (targetArt) {
                artBySusi.set(susiKey, targetArt);
            }
        }

        // Helper para determinar el EstadoMatchArticuloPlanilla de un artículo
        const getEstadoMatchForCatalogItem = (matched?: ArticuloCatalogItem | null): EstadoMatchArticuloPlanilla => {
            if (!matched) return 'SIN_MATCH';
            if (!matched.bomRefs || matched.bomRefs.length === 0) return 'SIN_ESTRUCTURA';
            const missingItem = matched.bomRefs.some((b) => !b.item);
            if (missingItem) return 'ESTRUCTURA_INCOMPLETA';
            return 'OK';
        };

        // 3. Cruzar cada entrada extraída con el Catálogo de Artículos
        for (const entry of allRawEntries) {
            const { code, talle: parsedTalle } = this.cleanArtCode(entry.articleRaw);
            entry.articleCode = code;
            entry.talle = entry.talle || parsedTalle || '';

            const matched = this.resolveTejidoArticle(
                entry.articleRaw,
                entry.talle,
                entry.colorRaw,
                entry.descRaw,
                artByCode,
                artBySusi,
                tejidoByModelSize,
                tejidoByModel,
                allByModelSize,
                allByModel,
                bomByPadre,
                customAliasMap,
            );

            if (matched) {
                entry.matchedArticle = {
                    id: matched.id,
                    codigo: matched.codigo,
                    descripcion: matched.descripcion,
                    marca: matched.marca,
                    modelo: matched.modelo,
                    talle: matched.talle,
                    variante: matched.variante,
                    codigoSusi: matched.codigoSusi,
                    estadoRevision: matched.estadoRevision,
                };
                const estMatch = getEstadoMatchForCatalogItem(matched);
                entry.isUnreviewed = estMatch !== 'OK';
            } else {
                entry.matchedArticle = null;
                entry.isUnreviewed = true;
            }
        }

        // Helper para buscar la duración esperada de un cambio desde machine_changes en la BD
        const resolveChangeDuration = (
            dbMachine: { id: string } | undefined,
            changeTypes: string[],
            defaultHours: number,
        ): {
            durationHours: number;
            durationMinutes: number;
            durationText: string;
            esEstimada: boolean;
            muestrasBd: number;
            motivoDuracion: string;
        } => {
            const sortedTypes = changeTypes.slice().sort();
            const typeKey = sortedTypes.join('+') || 'ARTICULO';
            const mKey = dbMachine ? `${dbMachine.id}__${typeKey}` : '';

            const specificHist = mKey ? changeDurationsByMachineAndType.get(mKey) : undefined;
            const globalHist =
                changeDurationsByType.get(typeKey) ||
                (typeKey === 'TALLE' ? changeDurationsByType.get('ARTICULO+TALLE') : undefined) ||
                (typeKey === 'COLOR+TALLE' ? changeDurationsByType.get('ARTICULO+COLOR+TALLE') : undefined);

            let hours = defaultHours;
            let muestras = 0;
            let motivo = '';

            if (specificHist && specificHist.length >= 2) {
                hours = specificHist.reduce((a, b) => a + b, 0) / specificHist.length;
                muestras = specificHist.length;
                motivo = `Promedio de esta máquina en BD (${muestras} cambios registrados de tipo ${typeKey})`;
            } else if (globalHist && globalHist.length > 0) {
                hours = globalHist.reduce((a, b) => a + b, 0) / globalHist.length;
                muestras = globalHist.length;
                motivo = `Promedio histórico en BD para ${typeKey.replace(/\+/g, ' + ')} (${muestras} registros en Mantenimiento)`;
            } else {
                motivo = `Tiempo estimado por defecto para ${typeKey.replace(/\+/g, ' + ')} (sin historial previo en BD)`;
            }

            const minutes = Math.max(5, Math.round(hours * 60));
            const cleanHours = Math.round((minutes / 60) * 100) / 100;
            const hPart = Math.floor(minutes / 60);
            const mPart = minutes % 60;
            const durationText = hPart > 0 ? `${hPart}h ${mPart > 0 ? `${mPart}m` : ''}`.trim() : `${minutes} min`;

            return {
                durationHours: cleanHours,
                durationMinutes: minutes,
                durationText,
                esEstimada: true,
                muestrasBd: muestras,
                motivoDuracion: motivo,
            };
        };

        // Helper para comparar si dos entradas representan el mismo artículo en máquina
        const isSameEntryArticle = (a: ParsedMachineEntry, b: ParsedMachineEntry): boolean => {
            if (a.matchedArticle && b.matchedArticle) {
                return a.matchedArticle.codigo.toUpperCase() === b.matchedArticle.codigo.toUpperCase();
            }
            const codeA = (a.articleRaw || a.articleCode || '').trim().toUpperCase().replace(/\s+/g, ' ');
            const codeB = (b.articleRaw || b.articleCode || '').trim().toUpperCase().replace(/\s+/g, ' ');
            const talleA = (a.talle || '').trim().toUpperCase();
            const talleB = (b.talle || '').trim().toUpperCase();
            const colorA = (a.colorRaw || '').trim().toUpperCase();
            const colorB = (b.colorRaw || '').trim().toUpperCase();
            return codeA === codeB && talleA === talleB && colorA === colorB;
        };

        // 4. Agrupar por (fecha, máquina) para evaluar las 24 horas del día (M + N) y detectar los cambios de la planilla
        const entriesByDateMachine = new Map<string, { M: ParsedMachineEntry[]; N: ParsedMachineEntry[] }>();
        for (const entry of allRawEntries) {
            if (!entry.articleRaw && !entry.descRaw) continue;
            const dmKey = `${entry.date || 'HOY'}__${entry.machine}`;
            if (!entriesByDateMachine.has(dmKey)) {
                entriesByDateMachine.set(dmKey, { M: [], N: [] });
            }
            const group = entriesByDateMachine.get(dmKey)!;
            if ((entry.shift || 'M').toUpperCase() === 'N') {
                group.N.push(entry);
            } else {
                group.M.push(entry);
            }
        }

        const listadoCambios: CambioPlanillaItem[] = [];

        const buildCambioArticuloRef = (e: ParsedMachineEntry): CambioArticuloRef => {
            const matched = e.matchedArticle ? artByCode.get(e.matchedArticle.codigo.toUpperCase()) : null;
            return {
                codigoSusana: (e.articleRaw || e.articleCode || 'SIN CÓDIGO').trim(),
                codigoCatalogo: matched ? matched.codigo : null,
                articuloId: matched ? matched.id : null,
                descripcion: matched?.descripcion || e.descRaw || 'Sin descripción',
                talle: e.talle || matched?.talle || '',
                color: e.colorRaw || matched?.variante || '',
                estadoMatch: getEstadoMatchForCatalogItem(matched),
            };
        };

        // Procesar un turno (12h) o las 24h cuando solo se subió un turno
        const processShiftEntries = (
            shiftEntries: ParsedMachineEntry[],
            shift: 'M' | 'N',
            shiftTotalHours: number,
            dbMachine: { id: string; number: number; typeId: string; machineTypeName: string; status: string } | undefined,
            dateStr: string,
            machineNum: number,
        ) => {
            // Filtrar duplicados idénticos consecutivos en la misma celda
            const deduped: ParsedMachineEntry[] = [];
            for (const ent of shiftEntries) {
                if (deduped.length === 0 || !isSameEntryArticle(deduped[deduped.length - 1], ent)) {
                    deduped.push(ent);
                } else {
                    // Si estaba duplicado en la misma celda, dejar en 0 la copia redundante
                    ent.grossHours = 0;
                    ent.netHours = 0;
                    ent.netSeconds = 0;
                    ent.hasChangeover = false;
                    this.computeEntryProductionAndYarn(ent, dbMachine, artByCode);
                }
            }

            if (deduped.length === 0) return;

            if (deduped.length === 1) {
                const e = deduped[0];
                e.orderInShift = 1;
                e.totalArticlesInMachineShift = 1;
                e.hasChangeover = false;
                e.changeoverRole = 'UNICO';
                e.changeoverType = null;
                e.changeoverTypes = [];
                e.changeoverDurationMinutes = 0;
                e.grossHours = shiftTotalHours;
                e.netHours = shiftTotalHours;
                e.netSeconds = Math.round(shiftTotalHours * 3600);
                e.horarioTexto =
                    shift === 'N'
                        ? `18:00 a 06:00 (${shiftTotalHours}h)`
                        : `06:00 a 18:00 (${shiftTotalHours}h)`;
                this.computeEntryProductionAndYarn(e, dbMachine, artByCode);
                return;
            }

            // Hay cambio en la planilla (2 o más artículos distintos en la máquina)
            const first = deduped[0];
            const second = deduped[1];

            const { changeTypes, label, defaultHours, inferredWithoutMatch } = this.inferChangeoverType(first, second);
            const durInfo = resolveChangeDuration(dbMachine, changeTypes, defaultHours);

            const claveCambio = `${dateStr}__${machineNum}__${shift}`;
            const defaultHora = shift === 'N' ? '06:00' : '07:00';
            const horaGuardada = horaOverrideMap.get(claveCambio);
            const horaEfectiva = horaGuardada || defaultHora;
            const horaEsDefault = !horaGuardada;

            const hoursSaliente = this.computeHoursBeforeChange(horaEfectiva, shift);

            first.orderInShift = 1;
            first.totalArticlesInMachineShift = deduped.length;
            first.hasChangeover = true;
            first.changeoverRole = 'SALIENTE_08AM';
            first.changeoverType = label;
            first.changeoverTypes = changeTypes;
            first.changeoverDurationMinutes = durInfo.durationMinutes;
            first.grossHours = hoursSaliente;
            first.netHours = hoursSaliente;
            first.netSeconds = Math.round(hoursSaliente * 3600);
            first.horarioTexto = `Hasta ${horaEfectiva} (${hoursSaliente}h antes del cambio)`;
            this.computeEntryProductionAndYarn(first, dbMachine, artByCode);

            const remainingEntries = deduped.slice(1);
            const grossRemainingTotal = Math.max(0.5, shiftTotalHours - hoursSaliente);
            const netRemainingTotal = Math.max(0.25, shiftTotalHours - hoursSaliente - durInfo.durationHours);
            const grossEach = Math.round((grossRemainingTotal / remainingEntries.length) * 100) / 100;
            const netEach = Math.round((netRemainingTotal / remainingEntries.length) * 100) / 100;

            remainingEntries.forEach((ent, idx) => {
                ent.orderInShift = idx + 2;
                ent.totalArticlesInMachineShift = deduped.length;
                ent.hasChangeover = true;
                ent.changeoverRole = 'ENTRANTE_08AM';
                ent.changeoverType = label;
                ent.changeoverTypes = changeTypes;
                ent.changeoverDurationMinutes = durInfo.durationMinutes;
                ent.grossHours = grossEach;
                ent.netHours = netEach;
                ent.netSeconds = Math.round(netEach * 3600);
                ent.horarioTexto = `Desde ${horaEfectiva} (${netEach}h netas tras ${durInfo.durationMinutes}m de ${label})`;
                this.computeEntryProductionAndYarn(ent, dbMachine, artByCode);
            });

            // Horas totales del artículo entrante en las 24h del día (M + N):
            // Si el cambio es en M (12h), en las 24h del día el entrante teje netEach + 12h de N (salvo que N cambie)
            const horasEntranteEn24h =
                shift === 'M' && shiftTotalHours === 12 ? Math.round((netEach + 12) * 100) / 100 : netEach;

            listadoCambios.push({
                id: claveCambio,
                fecha: dateStr,
                maquina: machineNum,
                area: first.area || second.area || '',
                turno: shift,
                tipoMaquina: dbMachine?.machineTypeName || 'Lonati Tejeduría',
                articuloSaliente: buildCambioArticuloRef(first),
                articuloEntrante: buildCambioArticuloRef(second),
                hora: horaEfectiva,
                horaEsDefault,
                motivoHora: horaEsDefault
                    ? `Horario por defecto (${defaultHora} hs). Podés cambiarlo haciendo clic sobre la hora.`
                    : `Horario personalizado guardado (${horaEfectiva} hs).`,
                tipoCambio: label,
                tiposCambioArray: changeTypes,
                tipoEsInferidoSinMatch: inferredWithoutMatch,
                duracionEsperadaMin: durInfo.durationMinutes,
                duracionTexto: durInfo.durationText,
                duracionEsEstimada: durInfo.esEstimada,
                motivoDuracion: durInfo.motivoDuracion,
                muestrasHistorialBd: durInfo.muestrasBd,
                horasTejidoSaliente: hoursSaliente,
                horasTejidoEntranteDia: horasEntranteEn24h,
            });
        };

        for (const [dmKey, group] of entriesByDateMachine.entries()) {
            const [dateStr, machineStr] = dmKey.split('__');
            const machineNum = Number(machineStr);
            const dbMachine = machineByNumber.get(machineNum);

            const hasM = group.M.length > 0;
            const hasN = group.N.length > 0;

            if (hasM && hasN) {
                processShiftEntries(group.M, 'M', 12, dbMachine, dateStr, machineNum);
                processShiftEntries(group.N, 'N', 12, dbMachine, dateStr, machineNum);

                // Caso puntual: M tenía 1 solo artículo, N tiene 1 solo artículo, pero entre M y N cambió el artículo
                const lastM = group.M[group.M.length - 1];
                const firstN = group.N[0];
                if (
                    group.M.length === 1 &&
                    group.N.length === 1 &&
                    lastM &&
                    firstN &&
                    !isSameEntryArticle(lastM, firstN)
                ) {
                    const { changeTypes, label, defaultHours, inferredWithoutMatch } = this.inferChangeoverType(
                        lastM,
                        firstN,
                    );
                    const durInfo = resolveChangeDuration(dbMachine, changeTypes, defaultHours);
                    const claveCambioN = `${dateStr}__${machineNum}__N`;
                    const horaGuardada = horaOverrideMap.get(claveCambioN);
                    const horaEfectiva = horaGuardada || '06:00';
                    const horaEsDefault = !horaGuardada;

                    const netHoursN = Math.max(0.5, Math.round((12 - durInfo.durationHours) * 100) / 100);
                    firstN.hasChangeover = true;
                    firstN.changeoverRole = 'ENTRANTE_08AM';
                    firstN.changeoverType = label;
                    firstN.changeoverTypes = changeTypes;
                    firstN.changeoverDurationMinutes = durInfo.durationMinutes;
                    firstN.grossHours = 12;
                    firstN.netHours = netHoursN;
                    firstN.netSeconds = Math.round(netHoursN * 3600);
                    firstN.horarioTexto = `Turno N (${netHoursN}h netas tras ${durInfo.durationMinutes}m de ${label})`;
                    this.computeEntryProductionAndYarn(firstN, dbMachine, artByCode);

                    listadoCambios.push({
                        id: claveCambioN,
                        fecha: dateStr,
                        maquina: machineNum,
                        area: firstN.area || lastM.area || '',
                        turno: 'N',
                        tipoMaquina: dbMachine?.machineTypeName || 'Lonati Tejeduría',
                        articuloSaliente: buildCambioArticuloRef(lastM),
                        articuloEntrante: buildCambioArticuloRef(firstN),
                        hora: horaEfectiva,
                        horaEsDefault,
                        motivoHora: horaEsDefault
                            ? 'Horario por defecto para turno noche (06:00 hs). Editable.'
                            : `Horario personalizado guardado (${horaEfectiva} hs).`,
                        tipoCambio: label,
                        tiposCambioArray: changeTypes,
                        tipoEsInferidoSinMatch: inferredWithoutMatch,
                        duracionEsperadaMin: durInfo.durationMinutes,
                        duracionTexto: durInfo.durationText,
                        duracionEsEstimada: durInfo.esEstimada,
                        motivoDuracion: durInfo.motivoDuracion,
                        muestrasHistorialBd: durInfo.muestrasBd,
                        horasTejidoSaliente: 12,
                        horasTejidoEntranteDia: netHoursN,
                    });
                }
            } else if (hasM && !hasN) {
                // Si se cargó solo el archivo M, proyectamos sobre las 24 horas del día
                processShiftEntries(group.M, 'M', 24, dbMachine, dateStr, machineNum);
            } else if (!hasM && hasN) {
                processShiftEntries(group.N, 'N', 24, dbMachine, dateStr, machineNum);
            }
        }

        listadoCambios.sort((a, b) => a.maquina - b.maquina || a.turno.localeCompare(b.turno));
        const totalCambiosProgramados08AM = listadoCambios.length;

        // 5. Consolidar Artículos y Pendientes de Completar (SIN_MATCH, SIN_ESTRUCTURA, ESTRUCTURA_INCOMPLETA)
        const articulosMap = new Map<string, ArticuloProduccionSummary>();
        const pendientesMap = new Map<string, PendientePlanillaItem>();
        const fechasSet = new Set<string>();
        const turnosSet = new Set<string>();
        const areasSet = new Set<string>();

        for (const entry of allRawEntries) {
            if (entry.date) fechasSet.add(entry.date);
            if (entry.shift) turnosSet.add(entry.shift);
            if (entry.area) areasSet.add(entry.area);

            if (!entry.articleRaw && !entry.descRaw) continue;
            if ((entry.netHours || 0) <= 0 && entry.totalArticlesInMachineShift === undefined) continue;

            const matched = entry.matchedArticle ? artByCode.get(entry.matchedArticle.codigo.toUpperCase()) : null;
            const estadoMatch = getEstadoMatchForCatalogItem(matched);

            // Registrar en pendientesCompletar si no está OK
            if (estadoMatch !== 'OK') {
                const rawSusi = (entry.articleRaw || entry.articleCode || 'SIN_CODIGO').trim();
                const pendKey = matched ? `ART__${matched.codigo.toUpperCase()}` : `RAW__${rawSusi.toUpperCase()}`;

                if (!pendientesMap.has(pendKey)) {
                    const candidatos = this.findSuggestedCandidatesForUnmatched(
                        rawSusi,
                        entry.talle,
                        artByCode,
                        tejidoByModel,
                        allByModel,
                    );
                    const compSinItem =
                        matched?.bomRefs.filter((b) => !b.item).map((b) => b.codigoComponente) || [];

                    let mensajeEstado = '';
                    if (estadoMatch === 'SIN_MATCH') {
                        mensajeEstado =
                            'El código de Susana no está vinculado a ningún artículo de la base de datos. Tocalo para elegir a qué código corresponde.';
                    } else if (estadoMatch === 'SIN_ESTRUCTURA') {
                        mensajeEstado = `Está matcheado con el artículo ${matched?.codigo}, pero no tiene estructura de hilados cargada.`;
                    } else {
                        mensajeEstado = `El artículo ${matched?.codigo} tiene estructura, pero falta vincular al depósito: ${compSinItem.join(', ')}.`;
                    }

                    pendientesMap.set(pendKey, {
                        key: pendKey,
                        codigoSusana: rawSusi,
                        talle: entry.talle || matched?.talle || '',
                        color: entry.colorRaw || matched?.variante || '',
                        descripcionPdf: entry.descRaw || matched?.descripcion || '',
                        maquinas: [],
                        areas: [],
                        estado: estadoMatch,
                        mensajeEstado,
                        articuloMatcheado: matched
                            ? {
                                  id: matched.id,
                                  codigo: matched.codigo,
                                  descripcion: matched.descripcion,
                                  etapa: matched.etapa || 'TEJIDO',
                              }
                            : null,
                        componentesSinItem: compSinItem,
                        candidatosSugeridos: candidatos,
                    });
                }
                const pend = pendientesMap.get(pendKey)!;
                if (!pend.maquinas.includes(entry.machine)) pend.maquinas.push(entry.machine);
                if (entry.area && !pend.areas.includes(entry.area)) pend.areas.push(entry.area);
            }

            const artTalle = (entry.talle || entry.matchedArticle?.talle || '').trim().toUpperCase();
            const key = entry.matchedArticle
                ? entry.matchedArticle.codigo.toUpperCase()
                : `${entry.articleCode || entry.articleRaw || 'SIN_CODIGO'}__${artTalle || 'U'}`.toUpperCase();

            if (!articulosMap.has(key)) {
                const estado = !matched
                    ? 'NO_ENCONTRADO'
                    : estadoMatch === 'OK'
                      ? EstadoRevisionArticulo.CHEQUEADO
                      : estadoMatch === 'ESTRUCTURA_INCOMPLETA'
                        ? EstadoRevisionArticulo.INCOMPLETO
                        : EstadoRevisionArticulo.PENDIENTE;
                const isUnreviewed = estadoMatch !== 'OK';

                let advertencia: string | undefined;
                if (!matched) {
                    advertencia = 'Código de Susana sin matchear con el catálogo.';
                } else if (matched.bomRefs.length === 0) {
                    advertencia = 'Artículo matcheado pero sin estructura de hilados cargada.';
                } else if (estadoMatch === 'ESTRUCTURA_INCOMPLETA') {
                    advertencia = 'Estructura con componentes sin ítem equivalente en depósito.';
                }

                const mappedRefs = (matched?.bomRefs || []).map((b) => {
                    const coneInfo = this.resolvePesoCono(b.item, b.codigoComponente, b.descripcionComponente);
                    return {
                        rol: 'HILADO',
                        colorNombre: b.descripcionComponente,
                        consumoKgPorDocena: b.cantidadKgPorDocena,
                        codigoComponente: b.codigoComponente,
                        item: b.item || {
                            id: b.codigoComponente,
                            codigoInterno: b.codigoComponente,
                            descripcion: b.descripcionComponente,
                            tono: null,
                            unidadPrincipal: 'KG',
                            pesoConoKg: coneInfo.pesoConoKg,
                            stockMinimo: 0,
                        },
                    };
                });

                articulosMap.set(key, {
                    codigo: matched ? matched.codigo : entry.articleCode || entry.articleRaw || 'SIN_CODIGO',
                    codigoOriginalPdf: entry.articleRaw,
                    codigoSusi: matched?.codigoSusi || entry.articleRaw,
                    descripcion: matched?.descripcion || entry.descRaw || 'Sin descripción',
                    marca: matched?.marca || this.inferMarca(entry.descRaw, entry.articleRaw),
                    talles: artTalle ? [artTalle] : [],
                    colores: [],
                    turnos: [],
                    fechas: [],
                    maquinasCount: 0,
                    maquinas: [],
                    maquinasDetalle: [],
                    cycleTimeSecondsPromedio: matched?.defaultCycleTimeSeconds || DEFAULT_CYCLE_SEC_PLANTA,
                    horasTejidoTotales: 0,
                    mediasTotales: 0,
                    paresTotales: 0,
                    docenasTotales: 0,
                    kilosHiladoTotales: 0,
                    estadoRevision: estado,
                    isUnreviewed,
                    advertencia,
                    itemRefs: mappedRefs,
                    articuloId: matched?.id,
                });
            }

            const artSummary = articulosMap.get(key)!;
            const talleToAdd = (entry.talle || entry.matchedArticle?.talle || '').trim().toUpperCase();
            if (talleToAdd && !artSummary.talles.includes(talleToAdd)) artSummary.talles.push(talleToAdd);
            if (entry.colorRaw && !artSummary.colores.includes(entry.colorRaw)) artSummary.colores.push(entry.colorRaw);
            if (entry.shift && !artSummary.turnos.includes(entry.shift)) artSummary.turnos.push(entry.shift);
            if (entry.date && !artSummary.fechas.includes(entry.date)) artSummary.fechas.push(entry.date);
            if (!artSummary.maquinas.includes(entry.machine)) artSummary.maquinas.push(entry.machine);

            artSummary.horasTejidoTotales =
                Math.round((artSummary.horasTejidoTotales + (entry.netHours || 0)) * 100) / 100;
            artSummary.mediasTotales += entry.mediasEstimadas || 0;
            artSummary.paresTotales = Math.round((artSummary.mediasTotales / 2) * 10) / 10;
            artSummary.docenasTotales = Math.round((artSummary.mediasTotales / 24) * 100) / 100;

            const entryKg = (entry.hiladosMaquina || []).reduce((acc, h) => acc + h.consumoKg, 0);
            artSummary.kilosHiladoTotales = Math.round((artSummary.kilosHiladoTotales + entryKg) * 100) / 100;

            artSummary.maquinasDetalle.push({
                machine: entry.machine,
                shift: entry.shift,
                area: entry.area,
                talle: entry.talle || '',
                color: entry.colorRaw || '',
                date: entry.date,
                hasChangeover: entry.hasChangeover,
                changeoverRole: entry.changeoverRole,
                changeoverType: entry.changeoverType,
                netHours: entry.netHours,
                cycleTimeSeconds: entry.cycleTimeSeconds,
                mediasEstimadas: entry.mediasEstimadas,
                paresEstimados: entry.paresEstimados,
                docenasEstimadas: entry.docenasEstimadas,
            });
        }

        const articulosSummaryList = Array.from(articulosMap.values()).map((a) => {
            a.maquinasCount = a.maquinas.length;
            a.maquinas.sort((x, y) => x - y);
            return a;
        });

        const pendientesCompletar = Array.from(pendientesMap.values())
            .map((p) => {
                p.maquinas.sort((a, b) => a - b);
                p.areas.sort();
                return p;
            })
            .sort((a, b) => b.maquinas.length - a.maquinas.length);

        // 6. Consolidar Colores
        const coloresMap = new Map<string, { color: string; maquinasSet: Set<number>; articulosSet: Set<string> }>();
        for (const entry of allRawEntries) {
            if (!entry.articleRaw && !entry.descRaw) continue;
            const col = entry.colorRaw?.trim() || 'SIN COLOR ESPECIFICADO';
            if (!coloresMap.has(col)) {
                coloresMap.set(col, { color: col, maquinasSet: new Set(), articulosSet: new Set() });
            }
            const cObj = coloresMap.get(col)!;
            cObj.maquinasSet.add(entry.machine);
            cObj.articulosSet.add(entry.matchedArticle?.codigo || entry.articleCode || entry.articleRaw);
        }

        const coloresList = Array.from(coloresMap.values())
            .map((c) => ({
                color: c.color,
                maquinasCount: c.maquinasSet.size,
                maquinas: Array.from(c.maquinasSet).sort((a, b) => a - b),
                articulos: Array.from(c.articulosSet),
            }))
            .sort((a, b) => b.maquinasCount - a.maquinasCount);

        // 7. Explosión de Hilados (listadoHilado + materialesList)
        const materialesMap = new Map<string, MaterialAsignadoSummary>();
        const hiladoPlanillaMap = new Map<string, HiladoPlanillaItem>();

        for (const entry of allRawEntries) {
            if (!entry.matchedArticle || (entry.netHours || 0) <= 0) continue;
            const matched = artByCode.get(entry.matchedArticle.codigo.toUpperCase());
            if (!matched) continue;

            const docenasEntry = entry.docenasEstimadas || 0;
            const timeInfo = timesByArticuloId.get(matched.id);
            const ritmoEsEstimado = !timeInfo?.isMeasured;

            for (const b of matched.bomRefs) {
                const consumoEntryKg = docenasEntry * b.cantidadKgPorDocena;
                const itemObj = b.item;
                const matKey = itemObj ? itemObj.id : b.codigoComponente;
                const codigoInterno = itemObj ? itemObj.codigoInterno : b.codigoComponente;
                const descripcion = itemObj ? itemObj.descripcion : b.descripcionComponente;
                const catNombre = itemObj?.category?.nombre || 'HILADO';
                const coneInfo = this.resolvePesoCono(itemObj, b.codigoComponente, descripcion);

                if (!materialesMap.has(matKey)) {
                    const stockInfo = itemObj ? stockByItemId.get(itemObj.id) : undefined;
                    const pickingKg = Math.round((stockInfo?.pickingKg || 0) * 100) / 100;
                    const reservaKg = Math.round((stockInfo?.reservaKg || 0) * 100) / 100;
                    const totalStockKg = Math.round((stockInfo?.totalDepositoKg || 0) * 100) / 100;
                    const minKg = Number(itemObj?.stockMinimo) || 0;

                    const suggestedPicking = new Set<string>();
                    if (stockInfo?.pickingPositions) {
                        for (const p of stockInfo.pickingPositions) suggestedPicking.add(p);
                    }
                    const catMatches = pickingPositionsByCategory.get(catNombre.trim().toUpperCase()) || [];
                    for (const p of catMatches) suggestedPicking.add(p);
                    if (suggestedPicking.size === 0 && allPickingPositions.length > 0) {
                        suggestedPicking.add(allPickingPositions[0]);
                    }

                    const stockLots = stockInfo?.lots || [];
                    const primeraPartida = stockLots.length > 0 ? stockLots[0].partida : null;
                    const primeraPosicion = stockLots.length > 0 ? stockLots[0].posicionCodigo : null;

                    materialesMap.set(matKey, {
                        itemId: matKey,
                        codigoInterno,
                        codigoComponenteBom: b.codigoComponente,
                        descripcion,
                        categoriaNombre: catNombre,
                        rol: 'HILADO',
                        tono: itemObj?.tono || null,
                        colorNombre: b.descripcionComponente,
                        proveedor: itemObj?.supplier?.name || null,
                        rotacion: itemObj?.rotacion || null,
                        unidadPrincipal: itemObj?.unidadPrincipal || 'KG',
                        pesoConoKg: coneInfo.pesoConoKg,
                        maquinasCount: 0,
                        maquinas: [],
                        consumoTotalKg: 0,
                        consumoMananaKg: 0,
                        consumoNocheKg: 0,
                        conosTotales: 0,
                        stockEnPickingKg: pickingKg,
                        stockEnReservaKg: reservaKg,
                        stockActualTotalKg: totalStockKg,
                        stockMinimoKg: minKg,
                        aPasarAPickingKg: 0,
                        stockRestanteTotalKg: totalStockKg,
                        aComprarKg: 0,
                        posicionesPickingSugeridas: Array.from(suggestedPicking),
                        posicionesStockReserva: stockInfo ? Array.from(stockInfo.reservaPositions) : [],
                        partidaSugerida: primeraPartida,
                        posicionOrigenSugerida: primeraPosicion,
                        esSustituto: Boolean((b as any).esSustituto),
                        sustitutoMotivo: (b as any).sustitutoMotivo || null,
                        prioridad: (b as any).prioridad || 1,
                        estadoAbastecimiento: 'OK',
                        articulosAsignados: [],
                    });

                    hiladoPlanillaMap.set(matKey, {
                        id: matKey,
                        itemId: itemObj ? itemObj.id : null,
                        codigoHilado: codigoInterno,
                        codigoComponenteBom: b.codigoComponente,
                        descripcionHilado: descripcion,
                        categoria: catNombre,
                        tipoMaterialCono: coneInfo.tipoMaterialCono,
                        kilosPedido: 0,
                        kilosManana: 0,
                        kilosNoche: 0,
                        pesoConoKg: coneInfo.pesoConoKg,
                        pesoConoEsEstimado: coneInfo.esEstimado,
                        motivoPesoCono: coneInfo.motivoPesoCono,
                        conos: 0,
                        stockTotalKg,
                        stockPickingKg: pickingKg,
                        stockReservaKg: reservaKg,
                        posicionesPicking: Array.from(suggestedPicking),
                        sinEquivalenciaItem: !itemObj,
                        esSustituto: Boolean((b as any).esSustituto),
                        sustitutoMotivo: (b as any).sustitutoMotivo || null,
                        maquinasCount: 0,
                        maquinas: [],
                        articulosDetalle: [],
                    });
                }

                const matSummary = materialesMap.get(matKey)!;
                const hiladoItem = hiladoPlanillaMap.get(matKey)!;

                matSummary.consumoTotalKg = Math.round((matSummary.consumoTotalKg + consumoEntryKg) * 100) / 100;
                hiladoItem.kilosPedido = Math.round((hiladoItem.kilosPedido + consumoEntryKg) * 100) / 100;

                if (entry.shift === 'N') {
                    matSummary.consumoNocheKg = Math.round((matSummary.consumoNocheKg + consumoEntryKg) * 100) / 100;
                    hiladoItem.kilosNoche = Math.round((hiladoItem.kilosNoche + consumoEntryKg) * 100) / 100;
                } else {
                    matSummary.consumoMananaKg = Math.round((matSummary.consumoMananaKg + consumoEntryKg) * 100) / 100;
                    hiladoItem.kilosManana = Math.round((hiladoItem.kilosManana + consumoEntryKg) * 100) / 100;
                }

                if (!matSummary.maquinas.includes(entry.machine)) {
                    matSummary.maquinas.push(entry.machine);
                }
                if (!hiladoItem.maquinas.includes(entry.machine)) {
                    hiladoItem.maquinas.push(entry.machine);
                }

                let artAssigned = matSummary.articulosAsignados.find((a) => a.codigoArticulo === matched.codigo);
                if (!artAssigned) {
                    artAssigned = {
                        codigoArticulo: matched.codigo,
                        descripcionArticulo: matched.descripcion,
                        maquinas: [],
                        docenasTejidas: 0,
                        consumoKg: 0,
                        isUnreviewed: matched.estadoRevision !== EstadoRevisionArticulo.CHEQUEADO,
                    };
                    matSummary.articulosAsignados.push(artAssigned);
                }
                if (!artAssigned.maquinas.includes(entry.machine)) {
                    artAssigned.maquinas.push(entry.machine);
                }
                artAssigned.docenasTejidas = Math.round((artAssigned.docenasTejidas + docenasEntry) * 100) / 100;
                artAssigned.consumoKg = Math.round((artAssigned.consumoKg + consumoEntryKg) * 100) / 100;

                let artDet = hiladoItem.articulosDetalle.find((a) => a.codigoArticulo === matched.codigo);
                if (!artDet) {
                    artDet = {
                        codigoArticulo: matched.codigo,
                        codigoSusana: entry.articleRaw || matched.codigoSusi || matched.codigo,
                        descripcion: matched.descripcion,
                        maquinas: [],
                        horasTejido: 0,
                        docenas: 0,
                        kilos: 0,
                        ritmoEsEstimado,
                    };
                    hiladoItem.articulosDetalle.push(artDet);
                }
                if (!artDet.maquinas.includes(entry.machine)) {
                    artDet.maquinas.push(entry.machine);
                }
                artDet.horasTejido = Math.round((artDet.horasTejido + (entry.netHours || 0)) * 100) / 100;
                artDet.docenas = Math.round((artDet.docenas + docenasEntry) * 100) / 100;
                artDet.kilos = Math.round((artDet.kilos + consumoEntryKg) * 100) / 100;
            }
        }

        const materialesList = Array.from(materialesMap.values())
            .map((m) => {
                m.maquinasCount = m.maquinas.length;
                m.maquinas.sort((a, b) => a - b);
                m.conosTotales = Math.ceil(m.consumoTotalKg / (m.pesoConoKg || 1.0));
                m.aPasarAPickingKg = Math.max(0, Math.round((m.consumoTotalKg - m.stockEnPickingKg) * 100) / 100);
                m.stockRestanteTotalKg = Math.round((m.stockActualTotalKg - m.consumoTotalKg) * 100) / 100;
                m.aComprarKg = Math.max(
                    0,
                    Math.round((m.consumoTotalKg + m.stockMinimoKg - m.stockActualTotalKg) * 100) / 100,
                );

                if (m.stockRestanteTotalKg < 0) {
                    m.estadoAbastecimiento = 'CRITICO_COMPRAR';
                } else if (m.stockRestanteTotalKg < m.stockMinimoKg) {
                    m.estadoAbastecimiento = 'ALERTA_MINIMO';
                } else if (m.aPasarAPickingKg > 0) {
                    m.estadoAbastecimiento = 'REPONER_PICKING';
                } else {
                    m.estadoAbastecimiento = 'OK';
                }
                return m;
            })
            .sort((a, b) => b.consumoTotalKg - a.consumoTotalKg);

        const listadoHilado: HiladoPlanillaItem[] = Array.from(hiladoPlanillaMap.values())
            .map((h) => {
                h.maquinas.sort((a, b) => a - b);
                h.maquinasCount = h.maquinas.length;
                h.conos = h.kilosPedido > 0 ? Math.max(1, Math.ceil(h.kilosPedido / (h.pesoConoKg || 1.0))) : 0;
                return h;
            })
            .sort((a, b) => b.kilosPedido - a.kilosPedido);

        // 8. Hoja para el Repartidor
        const hojaRepartidor: HojaRepartidorItem[] = [];
        const repartidorGroups = new Map<string, HojaRepartidorItem>();

        for (const entry of allRawEntries) {
            if (!entry.articleRaw && !entry.descRaw) continue;
            const matchedCode = entry.matchedArticle?.codigo || entry.articleCode || entry.articleRaw;
            const groupKey = `${entry.area}_${entry.shift || 'M'}_${matchedCode}`;

            if (!repartidorGroups.has(groupKey)) {
                repartidorGroups.set(groupKey, {
                    id: groupKey,
                    area: entry.area ? `Área ${entry.area}` : 'Sin Área',
                    shift: entry.shift || 'M',
                    maquinas: [],
                    maquinasCount: 0,
                    codigoArticulo: matchedCode,
                    codigoOriginalPdf: entry.articleRaw,
                    descripcionArticulo: entry.matchedArticle?.descripcion || entry.descRaw || '',
                    talle: entry.talle || entry.matchedArticle?.talle || '',
                    color: entry.colorRaw || '',
                    horasTejido: 0,
                    mediasEstimadas: 0,
                    paresEstimados: 0,
                    docenasEstimadas: 0,
                    cambiosDetalle: [],
                    materiales: [],
                    isUnreviewed: entry.isUnreviewed || false,
                });
            }

            const rItem = repartidorGroups.get(groupKey)!;
            if (!rItem.maquinas.includes(entry.machine)) {
                rItem.maquinas.push(entry.machine);
            }
            rItem.horasTejido = Math.round((rItem.horasTejido + (entry.netHours || 0)) * 100) / 100;
            rItem.mediasEstimadas += entry.mediasEstimadas || 0;
            rItem.paresEstimados = Math.round((rItem.mediasEstimadas / 2) * 10) / 10;
            rItem.docenasEstimadas = Math.round((rItem.mediasEstimadas / 24) * 100) / 100;

            if (entry.hasChangeover) {
                const roleLabel =
                    entry.changeoverRole === 'SALIENTE_08AM'
                        ? `Máq #${entry.machine}: Sale 07:00 AM (${entry.changeoverType})`
                        : `Máq #${entry.machine}: Entra 07:00 AM (${entry.changeoverType}, -${entry.changeoverDurationMinutes}m)`;
                if (!rItem.cambiosDetalle.includes(roleLabel)) {
                    rItem.cambiosDetalle.push(roleLabel);
                }
            }

            for (const h of entry.hiladosMaquina || []) {
                let mRef = rItem.materiales.find((m) => m.codigo === h.codigoItem);
                if (!mRef) {
                    const matGlobal = Array.from(materialesMap.values()).find((mg) => mg.codigoInterno === h.codigoItem);
                    mRef = {
                        codigo: h.codigoItem,
                        descripcion: h.descripcion,
                        rol: 'HILADO',
                        colorNombre: h.descripcion,
                        kgPorDocena: h.kgPorDocena,
                        consumoKg: 0,
                        conos: 0,
                        posicionPicking: matGlobal?.posicionesPickingSugeridas?.[0] || 'PICKING',
                    };
                    rItem.materiales.push(mRef);
                }
                mRef.consumoKg = Math.round(((mRef.consumoKg || 0) + h.consumoKg) * 100) / 100;
                mRef.conos = (mRef.conos || 0) + h.conosEstimados;
            }
        }

        for (const item of repartidorGroups.values()) {
            item.maquinasCount = item.maquinas.length;
            item.maquinas.sort((a, b) => a - b);
            hojaRepartidor.push(item);
        }
        hojaRepartidor.sort(
            (a, b) =>
                a.area.localeCompare(b.area) ||
                a.shift.localeCompare(b.shift) ||
                (a.maquinas[0] || 0) - (b.maquinas[0] || 0),
        );

        // 9. Hoja para Picking
        const hojaPicking: HojaPickingItem[] = [];
        for (const mat of materialesList) {
            const areasSetForMat = new Set<string>();
            const articlesSetForMat = new Set<string>();
            let hasUnreviewed = false;

            for (const art of mat.articulosAsignados) {
                articlesSetForMat.add(art.codigoArticulo);
                if (art.isUnreviewed) hasUnreviewed = true;
            }

            for (const m of mat.maquinas) {
                const foundEntries = allRawEntries.filter((e) => e.machine === m);
                for (const fe of foundEntries) {
                    if (fe.area) areasSetForMat.add(`Área ${fe.area}`);
                }
            }

            hojaPicking.push({
                id: `${mat.itemId}_${mat.rol}`,
                itemId: mat.itemId,
                codigoMaterial: mat.codigoInterno,
                descripcionMaterial: mat.descripcion,
                categoriaNombre: mat.categoriaNombre || 'HILADO',
                tono: mat.tono,
                colorNombre: mat.colorNombre,
                proveedor: mat.proveedor,
                rol: mat.rol,
                maquinasCount: mat.maquinasCount,
                maquinas: mat.maquinas,
                areas: Array.from(areasSetForMat).sort(),
                articulos: Array.from(articlesSetForMat).sort(),
                consumoDiaKg: mat.consumoTotalKg,
                consumoMananaKg: mat.consumoMananaKg,
                consumoNocheKg: mat.consumoNocheKg,
                conosNecesarios: mat.conosTotales,
                stockEnPickingKg: mat.stockEnPickingKg,
                stockEnReservaKg: mat.stockEnReservaKg,
                stockActualTotalKg: mat.stockActualTotalKg,
                stockMinimoKg: mat.stockMinimoKg,
                aPasarAPickingKg: mat.aPasarAPickingKg,
                stockRestanteTotalKg: mat.stockRestanteTotalKg,
                aComprarKg: mat.aComprarKg,
                posicionesPickingSugeridas: mat.posicionesPickingSugeridas,
                posicionesStockReserva: mat.posicionesStockReserva,
                partidaSugerida: mat.partidaSugerida,
                posicionOrigenSugerida: mat.posicionOrigenSugerida,
                esSustituto: mat.esSustituto,
                sustitutoMotivo: mat.sustitutoMotivo,
                prioridad: mat.prioridad,
                estadoAbastecimiento: mat.estadoAbastecimiento,
                hasUnreviewedArticles: hasUnreviewed,
            });
        }

        // 10. Resumen de Alertas y KPIs Globales
        const totalArticulos = articulosSummaryList.length;
        const articulosChequeados = articulosSummaryList.filter(
            (a) => a.estadoRevision === EstadoRevisionArticulo.CHEQUEADO,
        ).length;
        const articulosNoEncontrados = pendientesCompletar.filter((p) => p.estado === 'SIN_MATCH').length;
        const articulosSinEstructura = pendientesCompletar.filter((p) => p.estado === 'SIN_ESTRUCTURA').length;
        const articulosEstructuraIncompleta = pendientesCompletar.filter(
            (p) => p.estado === 'ESTRUCTURA_INCOMPLETA',
        ).length;
        const articulosNoRevisados = pendientesCompletar.length;

        const uniqueMachinesSet = new Set(allRawEntries.filter((e) => e.articleRaw || e.descRaw).map((e) => e.machine));
        const totalMediasEstimadas = articulosSummaryList.reduce((acc, a) => acc + a.mediasTotales, 0);
        const totalParesEstimados = Math.round((totalMediasEstimadas / 2) * 10) / 10;
        const totalDocenasEstimadas = Math.round((totalMediasEstimadas / 24) * 100) / 100;
        const totalKilosHiladoDia =
            Math.round(listadoHilado.reduce((acc, m) => acc + m.kilosPedido, 0) * 100) / 100;
        const totalConosDia = listadoHilado.reduce((acc, m) => acc + m.conos, 0);
        const totalItemsReponerPicking = materialesList.filter((m) => m.aPasarAPickingKg > 0).length;
        const totalItemsCriticosComprar = materialesList.filter(
            (m) => m.estadoAbastecimiento === 'CRITICO_COMPRAR' || m.estadoAbastecimiento === 'ALERTA_MINIMO',
        ).length;

        let mensajeAlerta = `100% de artículos completos (${articulosChequeados}/${totalArticulos}). Consumo del día: ${totalKilosHiladoDia.toLocaleString('es-AR')} kg de hilado (${totalConosDia} conos).`;
        if (articulosNoRevisados > 0) {
            mensajeAlerta = `Hay ${articulosNoRevisados} artículo(s) pendientes de completar (${articulosNoEncontrados} sin matchear, ${articulosSinEstructura + articulosEstructuraIncompleta} sin estructura completa). Tocalos abajo para completarlos.`;
        }

        const result: ProduccionParseResult = {
            fechas: Array.from(fechasSet).sort(),
            turnos: Array.from(turnosSet).sort(),
            areas: Array.from(areasSet).sort(),
            archivosProcesados,
            contextoPlanta: {
                plantaId: selectedPlant?.id || null,
                plantaNombre: selectedPlant?.nombre || 'Der Will',
                sector: selectedSector,
                plantasDisponibles,
                sectoresDisponibles: Array.from(sectoresSet),
                ritmoDocenasPorHoraDefault: DEFAULT_DOCENAS_POR_HORA,
                ritmoEsEstimadoGlobal: true,
            },
            listadoHilado,
            listadoCambios,
            pendientesCompletar,
            resumenAlertas: {
                totalArticulosDistintos: totalArticulos,
                totalMaquinasAsignadas: uniqueMachinesSet.size,
                articulosChequeados,
                articulosNoRevisados,
                articulosNoEncontrados,
                articulosSinEstructura,
                articulosEstructuraIncompleta,
                alertaGlobal: articulosNoRevisados > 0,
                mensajeAlerta,
                totalMediasEstimadas,
                totalParesEstimados,
                totalDocenasEstimadas,
                totalKilosHiladoDia,
                totalConosDia,
                totalCambiosProgramados08AM,
                totalItemsReponerPicking,
                totalItemsCriticosComprar,
            },
            articulos: articulosSummaryList.sort((a, b) => b.docenasTotales - a.docenasTotales),
            maquinas: allRawEntries.sort((a, b) => a.machine - b.machine || (a.orderInShift || 1) - (b.orderInShift || 1)),
            colores: coloresList,
            materiales: materialesList,
            hojaRepartidor,
            hojaPicking,
        };

        // Guardar o actualizar en planillas_produccion_diaria
        const fechaKey = result.fechas.join(', ') || new Date().toISOString().slice(0, 10);
        if (existingId) {
            await this.dataSource.query(
                `
                UPDATE planillas_produccion_diaria
                SET resumen = $1::jsonb,
                    datos_completos = $2::jsonb,
                    actualizado_en = NOW()
                WHERE id = $3
                `,
                [
                    JSON.stringify(result.resumenAlertas),
                    JSON.stringify(result),
                    existingId,
                ],
            );
            result.planillaId = existingId;
        } else {
            const saved = await this.dataSource.query(
                `
                INSERT INTO planillas_produccion_diaria (fecha, archivos, resumen, datos_completos, creado_por, creado_en, actualizado_en)
                VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, NOW(), NOW())
                RETURNING id, creado_en
                `,
                [
                    fechaKey,
                    JSON.stringify(archivosProcesados),
                    JSON.stringify(result.resumenAlertas),
                    JSON.stringify(result),
                    'PRODUCCION',
                ],
            );

            if (saved?.[0]) {
                result.planillaId = saved[0].id;
                result.creadoEn = saved[0].creado_en;
            }
        }

        return result;
    }

    /**
     * Calcula producción individual de una máquina en el tramo horario y su consumo de hilado.
     * Ritmo base de planta: 0,8 docenas por hora (187,5 segundos por media individual).
     */
    private computeEntryProductionAndYarn(
        entry: ParsedMachineEntry,
        dbMachine: { id: string; number: number; typeId: string; machineTypeName: string; status: string } | undefined,
        artByCode: Map<string, ArticuloCatalogItem>,
    ): void {
        entry.machineDbId = dbMachine?.id || null;
        entry.machineTypeName = dbMachine?.machineTypeName || 'Lonati Tejeduría';
        entry.machineStatus = dbMachine?.status || 'ACTIVA';

        const DEFAULT_CYCLE_SEC = 187.5; // 0,8 docenas por hora = 19,2 medias/hora = 187,5 seg/media
        const matched = entry.matchedArticle ? artByCode.get(entry.matchedArticle.codigo.toUpperCase()) : undefined;
        let cycleSec = DEFAULT_CYCLE_SEC;
        if (matched) {
            if (dbMachine?.typeId && matched.cycleTimeByMachineType.has(dbMachine.typeId)) {
                cycleSec = matched.cycleTimeByMachineType.get(dbMachine.typeId)!;
            } else {
                cycleSec = matched.defaultCycleTimeSeconds || DEFAULT_CYCLE_SEC;
            }
        }
        entry.cycleTimeSeconds = cycleSec;

        const netSec = entry.netSeconds || 0;
        const docenasExact = cycleSec > 0 ? netSec / cycleSec / 24 : 0;
        const docenas = Math.round(docenasExact * 100) / 100;
        const medias = Math.round(docenasExact * 24);
        const pares = Math.round((medias / 2) * 10) / 10;

        entry.mediasEstimadas = medias;
        entry.paresEstimados = pares;
        entry.docenasEstimadas = docenas;

        entry.hiladosMaquina = (matched?.bomRefs || []).map((b) => {
            const consumoKg = Math.round(docenas * b.cantidadKgPorDocena * 100) / 100;
            const coneInfo = this.resolvePesoCono(b.item, b.codigoComponente, b.descripcionComponente);
            return {
                codigoComponente: b.codigoComponente,
                codigoItem: b.item?.codigoInterno || b.codigoComponente,
                descripcion: b.descripcionComponente,
                kgPorDocena: b.cantidadKgPorDocena,
                consumoKg,
                conosEstimados: consumoKg > 0 ? Math.max(1, Math.ceil(consumoKg / coneInfo.pesoConoKg)) : 0,
            };
        });
    }

    /**
     * Infiere el tipo de cambio en la máquina comparando el artículo saliente vs el artículo entrante.
     * Funciona tanto cuando ambos artículos están matcheados en el catálogo como cuando alguno aún no lo está.
     */
    private inferChangeoverType(
        first: ParsedMachineEntry,
        second: ParsedMachineEntry,
    ): { changeTypes: string[]; label: string; defaultHours: number; inferredWithoutMatch: boolean } {
        const m1 = first.matchedArticle;
        const m2 = second.matchedArticle;
        const inferredWithoutMatch = !m1 || !m2;

        const parsed1 = this.cleanArtCode(first.articleRaw || first.articleCode || '');
        const parsed2 = this.cleanArtCode(second.articleRaw || second.articleCode || '');

        const model1 = (m1?.modelo || parsed1.code.split('_')[0] || '').trim().toUpperCase().replace(/^VN000/, 'VN');
        const model2 = (m2?.modelo || parsed2.code.split('_')[0] || '').trim().toUpperCase().replace(/^VN000/, 'VN');

        const talle1 = (m1?.talle || first.talle || parsed1.talle || '').trim().toUpperCase();
        const talle2 = (m2?.talle || second.talle || parsed2.talle || '').trim().toUpperCase();

        const var1 = (m1?.variante || first.colorRaw || '').trim().toUpperCase();
        const var2 = (m2?.variante || second.colorRaw || '').trim().toUpperCase();

        const sameModel = !!model1 && !!model2 && model1 === model2;
        const sameTalle = talle1 === talle2;
        const sameVar = var1 === var2;

        if (sameModel) {
            if (!sameTalle && sameVar) {
                return { changeTypes: ['TALLE'], label: 'CAMBIO DE TALLE', defaultHours: 0.58, inferredWithoutMatch };
            }
            if (sameTalle && !sameVar) {
                return { changeTypes: ['COLOR'], label: 'CAMBIO DE COLOR', defaultHours: 0.45, inferredWithoutMatch };
            }
            if (!sameTalle && !sameVar) {
                return {
                    changeTypes: ['COLOR', 'TALLE'],
                    label: 'CAMBIO COLOR + TALLE',
                    defaultHours: 0.75,
                    inferredWithoutMatch,
                };
            }
        }

        // Cambia el modelo / artículo
        if (!sameTalle && !sameVar) {
            return {
                changeTypes: ['ARTICULO', 'COLOR', 'TALLE'],
                label: 'CAMBIO ARTÍCULO + TALLE + COLOR',
                defaultHours: 0.77,
                inferredWithoutMatch,
            };
        }
        if (!sameTalle && sameVar) {
            return {
                changeTypes: ['ARTICULO', 'TALLE'],
                label: 'CAMBIO ARTÍCULO + TALLE',
                defaultHours: 0.58,
                inferredWithoutMatch,
            };
        }
        if (sameTalle && !sameVar) {
            return {
                changeTypes: ['ARTICULO', 'COLOR'],
                label: 'CAMBIO ARTÍCULO + COLOR',
                defaultHours: 1.85,
                inferredWithoutMatch,
            };
        }

        return { changeTypes: ['ARTICULO'], label: 'CAMBIO DE ARTÍCULO', defaultHours: 0.94, inferredWithoutMatch };
    }

    private descriptionSimilarity(desc1?: string, desc2?: string): number {
        if (!desc1 || !desc2) return 0;
        const stopWords = new Set(['DE', 'CON', 'LA', 'EL', 'Y', 'O', 'PARA', 'EN', 'POR', 'X', '1', '2', '3', '4', '5', '6', '1RA', '2DA', 'TOTALES']);
        const getWords = (str: string) =>
            str
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length >= 2 && !stopWords.has(w));

        const words1 = getWords(desc1);
        const words2 = new Set(getWords(desc2));
        if (words1.length === 0 || words2.size === 0) return 0;

        let common = 0;
        for (const w of words1) {
            if (words2.has(w)) common++;
        }
        return common;
    }

    /**
     * Explota recursivamente la estructura BOM de un artículo hasta llegar a los componentes hoja (hilados/insumos directos)
     */
    private getLeafBom(
        codigoPadre: string,
        bomByPadre: Map<string, { codigoComponente: string; descripcionInsumo: string; cantidad: number }[]>,
        visited: Set<string> = new Set(),
    ): { codigoComponente: string; descripcionInsumo: string; cantidad: number }[] {
        const direct = bomByPadre.get(codigoPadre.trim().toUpperCase()) || [];
        if (direct.length === 0) return [];

        const leaves: { codigoComponente: string; descripcionInsumo: string; cantidad: number }[] = [];
        for (const d of direct) {
            const comp = (d.codigoComponente || '').trim().toUpperCase();
            if (bomByPadre.has(comp) && !visited.has(comp)) {
                visited.add(comp);
                const subLeaves = this.getLeafBom(comp, bomByPadre, visited);
                visited.delete(comp);
                if (subLeaves.length > 0) {
                    for (const sl of subLeaves) {
                        leaves.push({
                            codigoComponente: sl.codigoComponente,
                            descripcionInsumo: sl.descripcionInsumo || sl.codigoComponente,
                            cantidad: sl.cantidad * d.cantidad,
                        });
                    }
                    continue;
                }
            }
            leaves.push(d);
        }
        return leaves;
    }

    /**
     * Recorre recursivamente hacia abajo el grafo BOM para encontrar todos los artículos descendientes
     * cuya etapa sea TEJIDO (artículo real que va en las máquinas de tejeduría).
     */
    private findTejidoDescendants(
        rootCode: string,
        artByCode: Map<string, ArticuloCatalogItem>,
        bomByPadre: Map<string, { codigoComponente: string; cantidad: number; descripcionInsumo?: string }[]>,
    ): ArticuloCatalogItem[] {
        const rootUpper = rootCode.trim().toUpperCase();
        const rootArt = artByCode.get(rootUpper);
        if (rootArt && rootArt.etapa === 'TEJIDO') {
            return [rootArt];
        }

        const visited = new Set<string>();
        const queue = [rootUpper];
        const results: ArticuloCatalogItem[] = [];

        while (queue.length > 0) {
            const curr = queue.shift()!;
            if (visited.has(curr)) continue;
            visited.add(curr);

            const currArt = artByCode.get(curr);
            if (currArt && currArt.etapa === 'TEJIDO') {
                if (!results.some((r) => r.id === currArt.id)) {
                    results.push(currArt);
                }
                continue;
            }

            const children = bomByPadre.get(curr) || [];
            for (const ch of children) {
                const compUpper = ch.codigoComponente.trim().toUpperCase();
                if (!visited.has(compUpper)) {
                    queue.push(compUpper);
                }
            }
        }

        return results;
    }

    /**
     * Selecciona el candidato de etapa TEJIDO desambiguando por Talle y Variante/Color sin adivinar otro talle ni otro color.
     */
    private selectBestTejidoCandidate(
        candidates: ArticuloCatalogItem[],
        talle?: string,
        colorCol?: string,
        descCol?: string,
        varHint?: string,
    ): ArticuloCatalogItem | null {
        if (!candidates || candidates.length === 0) return null;

        const targetTalle = (talle || '').trim().toUpperCase();
        const targetColor = (colorCol || '').trim().toUpperCase();
        const targetVar = (varHint || '').trim().toUpperCase();

        // 1. Filtrar por talle exacto si fue provisto
        let pool = candidates;
        if (targetTalle) {
            const byTalle = pool.filter((c) => {
                const ct = (c.talle || '').trim().toUpperCase();
                return !ct || ct === 'U' || ct === targetTalle;
            });
            if (byTalle.length === 0) return null; // No adivinar un talle distinto
            pool = byTalle;
        }

        // 2. Filtrar por variante explícita si fue provista
        if (targetVar) {
            const byVar = pool.filter((c) => {
                const cv = (c.variante || '').trim().toUpperCase();
                const codeParts = c.codigo.toUpperCase().split('_');
                const lastPart = codeParts[codeParts.length - 1];
                return cv === targetVar || lastPart === targetVar || cv === 'U';
            });
            if (byVar.length === 1) return byVar[0];
            if (byVar.length > 1) pool = byVar;
            if (byVar.length === 0) return null; // No adivinar otra variante
        }

        if (pool.length === 1) return pool[0];

        // 3. Desambiguar por el primer color principal del texto de Susana
        if (targetColor) {
            let colorKey = '';
            const firstToken = targetColor.split(/[\s/]+/)[0] || '';
            if (firstToken === 'WHITE' || firstToken === 'BLANCO' || targetColor === 'BB') {
                colorKey = 'B';
            } else if (firstToken === 'BLACK' || firstToken === 'NEGRO' || targetColor === 'PP') {
                colorKey = 'N';
            } else if (
                firstToken === 'GRIS' ||
                firstToken === 'GREY' ||
                firstToken === 'MELANGE' ||
                targetColor.includes('MELANGE') ||
                targetColor === 'HG'
            ) {
                colorKey = 'G';
            }

            if (colorKey) {
                const byColor = pool.filter((c) => {
                    const cv = (c.variante || '').trim().toUpperCase();
                    const code = c.codigo.toUpperCase();
                    if (colorKey === 'B' && (cv === 'B' || cv === 'BB' || code.endsWith('_B') || code.endsWith('_BB'))) return true;
                    if (colorKey === 'N' && (cv === 'N' || cv === 'PP' || code.endsWith('_N') || code.endsWith('_PP'))) return true;
                    if (colorKey === 'G' && (cv === 'G' || cv === 'M' || cv === 'HG' || code.endsWith('_G') || code.endsWith('_HG'))) return true;
                    return false;
                });
                if (byColor.length === 1) return byColor[0];
            }
        }

        return null;
    }

    /**
     * Busca sugerencias de candidatos en la BD para mostrar arriba de todo cuando un artículo está SIN_MATCH
     */
    private findSuggestedCandidatesForUnmatched(
        rawCode: string,
        talleCol: string | undefined,
        artByCode: Map<string, ArticuloCatalogItem>,
        tejidoByModel: Map<string, ArticuloCatalogItem[]>,
        allByModel: Map<string, ArticuloCatalogItem[]>,
    ): {
        id: string;
        codigo: string;
        descripcion: string;
        modelo: string | null;
        talle: string | null;
        variante: string | null;
        etapa: string | null;
        tieneEstructura: boolean;
    }[] {
        const { code } = this.cleanArtCode(rawCode);
        const model = code.split('_')[0].toUpperCase();
        const vnNorm = model.startsWith('VN000') ? `VN${model.slice(5)}` : model;
        const size = (talleCol || '').trim().toUpperCase();

        const results: ArticuloCatalogItem[] = [];
        for (const mName of [model, vnNorm]) {
            if (!mName) continue;
            const list = tejidoByModel.get(mName) || allByModel.get(mName) || [];
            for (const item of list) {
                if (!results.some((r) => r.id === item.id)) results.push(item);
            }
        }

        if (results.length === 0 && model.length >= 4) {
            const prefix = vnNorm.slice(0, 6);
            for (const item of artByCode.values()) {
                if (item.etapa === 'TEJIDO' && item.codigo.toUpperCase().startsWith(prefix)) {
                    results.push(item);
                    if (results.length >= 12) break;
                }
            }
        }

        results.sort((a, b) => {
            const aSameSize = (a.talle || '').toUpperCase() === size ? 0 : 1;
            const bSameSize = (b.talle || '').toUpperCase() === size ? 0 : 1;
            if (aSameSize !== bSameSize) return aSameSize - bSameSize;
            return a.codigo.localeCompare(b.codigo);
        });

        return results.slice(0, 12).map((a) => ({
            id: a.id,
            codigo: a.codigo,
            descripcion: a.descripcion,
            modelo: a.modelo || null,
            talle: a.talle || null,
            variante: a.variante || null,
            etapa: a.etapa || null,
            tieneEstructura: (a.bomRefs?.length || 0) > 0,
        }));
    }

    /**
     * Resuelve el código crudo del PDF de Susana a nuestro artículo exacto de etapa TEJIDO (<MODELO>_<TALLE>_<VARIANTE>)
     * sin adivinar artículos de otro talle ni variante cuando no hay certeza.
     */
    private resolveTejidoArticle(
        rawCode: string,
        talleCol: string | undefined,
        colorCol: string | undefined,
        descCol: string | undefined,
        artByCode: Map<string, ArticuloCatalogItem>,
        artBySusi: Map<string, ArticuloCatalogItem>,
        tejidoByModelSize: Map<string, ArticuloCatalogItem[]>,
        _tejidoByModel: Map<string, ArticuloCatalogItem[]>,
        allByModelSize: Map<string, ArticuloCatalogItem[]>,
        _allByModel: Map<string, ArticuloCatalogItem[]>,
        bomByPadre: Map<string, { codigoComponente: string; cantidad: number; descripcionInsumo?: string }[]>,
        customAliasMap?: Map<string, string>,
    ): ArticuloCatalogItem | null {
        if (!rawCode) return null;
        const rawUpper = rawCode.trim().toUpperCase().replace(/\s+/g, ' ');
        const talleUpper = (talleCol || '').trim().toUpperCase();
        const colorUpper = (colorCol || '').trim().toUpperCase();

        // 0. Alias personalizado guardado por el usuario en articulo_alias_susana
        if (customAliasMap) {
            const customTarget =
                customAliasMap.get(`${rawUpper}__${talleUpper}__${colorUpper}`) ||
                customAliasMap.get(`${rawUpper}__${talleUpper}`) ||
                customAliasMap.get(rawUpper);
            if (customTarget && artByCode.has(customTarget.toUpperCase())) {
                return artByCode.get(customTarget.toUpperCase())!;
            }
        }

        // 1. Alias explícito de Susana (diccionario verificado)
        const aliasTarget =
            SUSI_ALIAS_TO_TEJIDO[`${rawUpper}__${talleUpper}__${colorUpper}`] ||
            SUSI_ALIAS_TO_TEJIDO[`${rawUpper}__${talleUpper}`] ||
            (talleUpper ? SUSI_ALIAS_TO_TEJIDO[`${rawUpper} ${talleUpper}`] : undefined) ||
            (talleUpper ? SUSI_ALIAS_TO_TEJIDO[`${rawUpper}-${talleUpper}`] : undefined) ||
            SUSI_ALIAS_TO_TEJIDO[rawUpper];

        if (aliasTarget) {
            const aliasUpper = aliasTarget.toUpperCase();
            if (artByCode.has(aliasUpper)) {
                const aliasArt = artByCode.get(aliasUpper)!;
                if (aliasArt.etapa === 'TEJIDO') return aliasArt;
                const desc = this.findTejidoDescendants(aliasArt.codigo, artByCode, bomByPadre);
                if (desc.length === 1) return desc[0];
                if (desc.length > 1) return this.selectBestTejidoCandidate(desc, talleCol, colorCol, descCol) || aliasArt;
                return aliasArt;
            }
        }

        // 2. Coincidencia directa por columna codigoSusi
        if (artBySusi.has(rawUpper)) {
            const susiArt = artBySusi.get(rawUpper)!;
            if (susiArt.etapa === 'TEJIDO') return susiArt;
            const desc = this.findTejidoDescendants(susiArt.codigo, artByCode, bomByPadre);
            if (desc.length === 1) return desc[0];
            if (desc.length > 1) return this.selectBestTejidoCandidate(desc, talleCol, colorCol, descCol) || susiArt;
            return susiArt;
        }

        // 3. Coincidencia directa por código exacto en el catálogo
        if (artByCode.has(rawUpper)) {
            const exactArt = artByCode.get(rawUpper)!;
            if (exactArt.etapa === 'TEJIDO') return exactArt;
            const desc = this.findTejidoDescendants(exactArt.codigo, artByCode, bomByPadre);
            if (desc.length === 1) return desc[0];
            if (desc.length > 1) return this.selectBestTejidoCandidate(desc, talleCol, colorCol, descCol) || exactArt;
            return exactArt;
        }

        // 4. Coincidencia directa reemplazando espacios/guiones por guiones bajos
        const underScoreCode = rawUpper.replace(/[\s-]+/g, '_');
        if (artByCode.has(underScoreCode)) {
            const underArt = artByCode.get(underScoreCode)!;
            if (underArt.etapa === 'TEJIDO') return underArt;
            const desc = this.findTejidoDescendants(underArt.codigo, artByCode, bomByPadre);
            if (desc.length === 1) return desc[0];
            if (desc.length > 1) return this.selectBestTejidoCandidate(desc, talleCol, colorCol, descCol) || underArt;
            return underArt;
        }

        // 5. Normalización estricta por Modelo + Talle + Variante
        const sizeNormMap: Record<string, string> = { LG: 'L', MD: 'M', SM: 'S', KXK: 'KXL' };
        const validSizes = [
            'XS',
            'S',
            'M',
            'L',
            'XL',
            'XXL',
            'KXS',
            'KS',
            'KM',
            'KL',
            'KXL',
            'KXXL',
            '1',
            '2',
            '3',
            '4',
            '5',
        ];

        let talle = (talleCol || '').trim().toUpperCase().split(/\s+/)[0] || '';
        talle = sizeNormMap[talle] || talle;
        const color = (colorCol || '').trim().toUpperCase();

        const rawClean = rawUpper.replace(/-\s+/g, '-').replace(/\s+-/g, '-');
        const tokens = rawClean.split(/\s+/);

        let model = '';
        let size = talle;
        let varHint = '';

        if (tokens.length >= 2 && /^\d{7}$/.test(tokens[0]) && /^\d{3}$/.test(tokens[1])) {
            model = `${tokens[0]}-${tokens[1]}`;
            if (tokens.length >= 3) {
                const sTok = sizeNormMap[tokens[2]] || tokens[2];
                if (validSizes.includes(sTok)) {
                    size = sTok;
                    if (tokens.length >= 4) varHint = tokens[3];
                }
            }
        } else if (tokens[0].includes('-')) {
            const subParts = tokens[0].split('-');
            if (subParts.length === 2) {
                model = tokens[0];
                if (tokens.length >= 2) {
                    const sTok = sizeNormMap[tokens[1]] || tokens[1];
                    if (validSizes.includes(sTok)) {
                        size = sTok;
                        if (tokens.length >= 3) varHint = tokens[2];
                    }
                }
            } else if (subParts.length >= 3) {
                model = `${subParts[0]}-${subParts[1]}`;
                const sTok = sizeNormMap[subParts[2]] || subParts[2];
                if (validSizes.includes(sTok)) {
                    size = sTok;
                    if (subParts.length >= 4) varHint = subParts[3];
                }
            }
        } else {
            model = tokens[0];
            if (tokens.length >= 2) {
                const sTok = sizeNormMap[tokens[1]] || tokens[1];
                if (validSizes.includes(sTok)) {
                    size = sTok;
                    if (tokens.length >= 3) varHint = tokens[2];
                }
            }
        }

        if (!size && talle) size = talle;
        if (varHint === 'M' && color.includes('MELANGE')) varHint = 'G';

        const vnNorm = model.startsWith('VN000') ? `VN${model.slice(5)}` : model;

        // 5b. Construcción directa `${model}_${size}_${varHint}`
        if (model && size && varHint) {
            for (const mName of [model, vnNorm]) {
                const directKey = `${mName}_${size}_${varHint}`.toUpperCase();
                if (artByCode.has(directKey)) {
                    const directArt = artByCode.get(directKey)!;
                    if (directArt.etapa === 'TEJIDO') return directArt;
                    const desc = this.findTejidoDescendants(directArt.codigo, artByCode, bomByPadre);
                    if (desc.length === 1) return desc[0];
                    if (desc.length > 1) return this.selectBestTejidoCandidate(desc, size, color, descCol, varHint);
                    return directArt;
                }
            }
        }

        // 6. Buscar en tejidoByModelSize (mismo Modelo y mismo Talle)
        let candidates = tejidoByModelSize.get(`${model}__${size}`) || [];
        if (candidates.length === 0 && vnNorm !== model) {
            candidates = tejidoByModelSize.get(`${vnNorm}__${size}`) || [];
        }
        if (candidates.length > 0) {
            return this.selectBestTejidoCandidate(candidates, size, color, descCol, varHint);
        }

        // 7. Buscar en allByModelSize (mismo Modelo y mismo Talle) y descender por BOM a TEJIDO
        const packCandidates =
            allByModelSize.get(`${model}__${size}`) ||
            (vnNorm !== model ? allByModelSize.get(`${vnNorm}__${size}`) : []) ||
            [];
        if (packCandidates.length > 0) {
            const tejidoDescendants: ArticuloCatalogItem[] = [];
            for (const pc of packCandidates) {
                const desc = this.findTejidoDescendants(pc.codigo, artByCode, bomByPadre);
                for (const d of desc) {
                    if (!tejidoDescendants.some((td) => td.id === d.id)) tejidoDescendants.push(d);
                }
            }
            if (tejidoDescendants.length > 0) {
                return this.selectBestTejidoCandidate(tejidoDescendants, size, color, descCol, varHint);
            }
        }

        return null;
    }

    // =========================================================================
    // GESTIÓN DE STOCK, DEPÓSITOS Y PEDIDOS DE ARTÍCULOS (SECTOR PRODUCCIÓN)
    // =========================================================================

    async getDepositosArticulos(): Promise<any[]> {
        await this.ensureSchemaAndSeed();
        const depositos = await this.dataSource.query(`
            SELECT d.*,
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'id', p.id,
                            'codigo', p.codigo,
                            'descripcion', p.descripcion,
                            'capacidadDocenas', p.capacidad_docenas,
                            'activo', p.activo
                        )
                    ) FILTER (WHERE p.id IS NOT NULL),
                    '[]'::jsonb
                ) AS posiciones
            FROM depositos_articulos d
            LEFT JOIN posiciones_articulos p ON p.deposito_id = d.id
            GROUP BY d.id
            ORDER BY d.codigo ASC
        `);

        // Resumen de stock por etapa desde movimientos_articulos + pedidos_produccion
        const stockEtapas = await this.dataSource.query(`
            SELECT
                articulo_codigo AS "articuloCodigo",
                SUM(docenas_pedidas)::numeric(12,2) AS "docenasPedidas",
                SUM(docenas_tejidas)::numeric(12,2) AS "docenasTejidas",
                SUM(docenas_costuradas)::numeric(12,2) AS "docenasCosturadas",
                SUM(docenas_empaquetadas)::numeric(12,2) AS "docenasEmpaquetadas"
            FROM pedidos_produccion
            GROUP BY articulo_codigo
        `);

        return { depositos, resumenStockPorArticulo: stockEtapas } as any;
    }

    async crearPosicionArticulo(dto: {
        depositoId: string;
        codigo: string;
        descripcion?: string;
        capacidadDocenas?: number;
    }): Promise<any> {
        await this.ensureSchemaAndSeed();
        const res = await this.dataSource.query(
            `
            INSERT INTO posiciones_articulos (deposito_id, codigo, descripcion, capacidad_docenas, activo)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (deposito_id, codigo) DO UPDATE
                SET descripcion = EXCLUDED.descripcion,
                    capacidad_docenas = EXCLUDED.capacidad_docenas
            RETURNING *
            `,
            [dto.depositoId, dto.codigo.trim().toUpperCase(), dto.descripcion || null, dto.capacidadDocenas || 500],
        );
        return res[0];
    }

    async listarPedidosProduccion(): Promise<any[]> {
        await this.ensureSchemaAndSeed();
        return this.dataSource.query(`
            SELECT p.*,
                GREATEST(0, p.docenas_pedidas - p.docenas_tejidas) AS "faltanteTejerDocenas",
                GREATEST(0, p.docenas_tejidas - p.docenas_costuradas) AS "enStockTejeduriaDocenas",
                GREATEST(0, p.docenas_costuradas - p.docenas_empaquetadas) AS "enStockCosturaDocenas",
                p.docenas_empaquetadas AS "enStockTerminadoDocenas"
            FROM pedidos_produccion p
            ORDER BY p.actualizado_en DESC, p.creado_en DESC
        `);
    }

    async crearPedidoProduccion(dto: {
        numeroPedido: string;
        clienteMarca?: string;
        articuloCodigo: string;
        codigoSusi?: string;
        talle?: string;
        colorDescripcion?: string;
        docenasPedidas: number;
        docenasTejidas?: number;
        docenasCosturadas?: number;
        docenasEmpaquetadas?: number;
        posicionActual?: string;
        prioridad?: string;
        fechaEntrega?: string;
        observaciones?: string;
    }): Promise<any> {
        await this.ensureSchemaAndSeed();
        const res = await this.dataSource.query(
            `
            INSERT INTO pedidos_produccion (
                numero_pedido, cliente_marca, articulo_codigo, codigo_susi, talle, color_descripcion,
                docenas_pedidas, docenas_tejidas, docenas_costuradas, docenas_empaquetadas,
                posicion_actual, prioridad, fecha_entrega, observaciones
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
            `,
            [
                dto.numeroPedido.trim().toUpperCase(),
                dto.clienteMarca || 'ADIDAS',
                dto.articuloCodigo.trim().toUpperCase(),
                dto.codigoSusi || dto.articuloCodigo,
                dto.talle || null,
                dto.colorDescripcion || null,
                Number(dto.docenasPedidas) || 0,
                Number(dto.docenasTejidas) || 0,
                Number(dto.docenasCosturadas) || 0,
                Number(dto.docenasEmpaquetadas) || 0,
                dto.posicionActual || 'TEJ-CANASTO-01',
                dto.prioridad || 'NORMAL',
                dto.fechaEntrega || null,
                dto.observaciones || null,
            ],
        );
        return res[0];
    }

    async actualizarPedidoProduccion(
        id: string,
        dto: {
            docenasPedidas?: number;
            docenasTejidas?: number;
            docenasCosturadas?: number;
            docenasEmpaquetadas?: number;
            posicionActual?: string;
            estado?: string;
            observaciones?: string;
        },
    ): Promise<any> {
        await this.ensureSchemaAndSeed();
        const res = await this.dataSource.query(
            `
            UPDATE pedidos_produccion
            SET docenas_pedidas = COALESCE($2::numeric, docenas_pedidas),
                docenas_tejidas = COALESCE($3::numeric, docenas_tejidas),
                docenas_costuradas = COALESCE($4::numeric, docenas_costuradas),
                docenas_empaquetadas = COALESCE($5::numeric, docenas_empaquetadas),
                posicion_actual = COALESCE($6::varchar, posicion_actual),
                estado = COALESCE($7::varchar, estado),
                observaciones = COALESCE($8::text, observaciones),
                actualizado_en = NOW()
            WHERE id = $1::uuid
            RETURNING *
            `,
            [
                id,
                dto.docenasPedidas ?? null,
                dto.docenasTejidas ?? null,
                dto.docenasCosturadas ?? null,
                dto.docenasEmpaquetadas ?? null,
                dto.posicionActual ?? null,
                dto.estado ?? null,
                dto.observaciones ?? null,
            ],
        );
        return res[0];
    }

    /**
     * Sincroniza la última planilla diaria con la tabla de Pedidos/Stock de Artículos
     * para poblar o actualizar automáticamente el avance de tejido del día
     */
    async sincronizarPlanillaConPedidos(): Promise<{ creados: number; actualizados: number }> {
        const ultima = await this.getUltimaPlanilla();
        if (!ultima || !ultima.articulos) return { creados: 0, actualizados: 0 };

        let creados = 0;
        let actualizados = 0;
        const fechaStr = ultima.fechas?.[0] || 'DIARIO';

        for (const art of ultima.articulos) {
            const numPedido = `OP-${fechaStr}-${art.codigo}`;
            const existing = await this.dataSource.query(
                `SELECT id FROM pedidos_produccion WHERE numero_pedido = $1 LIMIT 1`,
                [numPedido],
            );
            if (existing && existing.length > 0) {
                await this.dataSource.query(
                    `
                    UPDATE pedidos_produccion
                    SET docenas_tejidas = $2,
                        actualizado_en = NOW()
                    WHERE id = $1
                    `,
                    [existing[0].id, art.docenasTotales],
                );
                actualizados++;
            } else {
                // Estimar pedido total como al menos las docenas del día * 3 (o 100 docenas mínimo)
                const pedidas = Math.max(100, Math.ceil(art.docenasTotales * 2));
                await this.crearPedidoProduccion({
                    numeroPedido: numPedido,
                    clienteMarca: art.marca,
                    articuloCodigo: art.codigo,
                    codigoSusi: art.codigoOriginalPdf,
                    talle: art.talles?.[0] || '',
                    colorDescripcion: art.colores?.[0] || '',
                    docenasPedidas: pedidas,
                    docenasTejidas: art.docenasTotales,
                    docenasCosturadas: 0,
                    docenasEmpaquetadas: 0,
                    posicionActual: 'TEJ-CANASTO-01',
                    prioridad: art.maquinasCount >= 3 ? 'ALTA' : 'NORMAL',
                    fechaEntrega: fechaStr,
                    observaciones: `Generado desde Planilla de Producción (${art.maquinasCount} máq.)`,
                });
                creados++;
            }
        }
        return { creados, actualizados };
    }

    /**
     * Parser de bajo nivel para extraer celdas por máquina y sublíneas de un Buffer PDF
     */
    private async extractPdfEntries(buffer: Buffer, filename: string): Promise<ParsedMachineEntry[]> {
        const parser = new PDFParse({ data: buffer });
        await parser.load();
        const numPages = parser.doc.numPages;

        const match = filename.match(/(\d{2}-\d{2})\s+(\d+)\s+([MN])\.pdf/i);
        const fileDate = match ? match[1] : '';
        const fileArea = match ? match[2] : '';
        const fileShift = match ? match[3].toUpperCase() : '';

        const machineEntries: ParsedMachineEntry[] = [];

        for (let p = 1; p <= numPages; p++) {
            const page = await parser.doc.getPage(p);
            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeight = viewport.height;
            const textContent = await page.getTextContent();

            const items: { text: string; x: number; y: number; fs: number }[] = [];
            for (const it of textContent.items) {
                const str = (it.str || '').trim();
                if (str) {
                    const rawX = it.transform[4];
                    const rawY = it.transform[5];
                    const fs = it.transform[0] || it.height || 10;
                    const normY = Math.round((pageHeight - rawY) * 10) / 10;
                    const normX = Math.round(rawX * 10) / 10;

                    items.push({
                        text: str,
                        x: normX,
                        y: normY,
                        fs: Math.round(fs * 10) / 10,
                    });
                }
            }

            // 1. Detección dinámica de encabezados en el tercio superior de la página
            const hMaq = items.find((it) => it.text.includes('MAQ') && it.y < 60) || { x: 20.2 };
            const hArt = items.find((it) => it.text.includes('ARTICULO') && it.y < 60) || { x: 65.6 };
            const hDesc = items.find((it) => it.text.includes('DESCRIPC') && it.y < 60) || { x: 151.1 };
            const hTalle = items.find((it) => it.text.includes('TALLE') && it.y < 60) || { x: 222.6 };
            const h1ra = items.find((it) => it.text === '1ra' && it.y < 60) || { x: 390.8 };

            // Umbrales dinámicos entre columnas según la plantilla
            const colMaqMax = (hMaq.x + hArt.x) / 2;
            const colArtMax = (hArt.x + hDesc.x) / 2;
            const colDescMax = (hDesc.x + hTalle.x) / 2;
            const colTalleMax = hTalle.x + 18;
            const colColorMax = h1ra.x - 10;

            // 2. Identificar máquinas presentes en la columna MAQ
            const machines = items
                .filter(
                    (it) =>
                        it.x < colMaqMax &&
                        /^\d+$/.test(it.text) &&
                        it.y > 60 &&
                        it.y < pageHeight - 40,
                )
                .sort((a, b) => a.y - b.y);

            if (machines.length === 0) continue;

            // 3. Paso promedio entre filas de máquinas
            const pitch =
                machines.length > 1
                    ? (machines[machines.length - 1].y - machines[0].y) / (machines.length - 1)
                    : 21.6;

            for (let i = 0; i < machines.length; i++) {
                const m = machines[i];
                const mNum = parseInt(m.text, 10);

                // Delimitación exacta del alto de fila según grilla de Excel
                const yTop = m.y - pitch * 0.667;
                const yBottom = m.y + pitch * 0.333;

                const boxItems = items.filter(
                    (it) =>
                        it.y >= yTop &&
                        it.y < yBottom &&
                        it !== m &&
                        it.text !== 'TOTALES' &&
                        it.text !== '0' &&
                        it.text.trim().length > 0,
                );

                const artItems = boxItems.filter((it) => it.x >= colMaqMax && it.x < colArtMax && it.text !== 'U');
                const descItems = boxItems.filter((it) => it.x >= colArtMax && it.x < colDescMax);
                const talleItems = boxItems.filter((it) => it.x >= colDescMax && it.x < colTalleMax);
                const colorItems = boxItems.filter((it) => it.x >= colTalleMax && it.x < colColorMax);

                // Si no hay código de artículo, la máquina está detenida o vacía. No crear artículos espurios desde la descripción
                if (artItems.length === 0) {
                    continue;
                }

                if (artItems.length === 1) {
                    const art = artItems[0];
                    const desc = descItems
                        .sort((a, b) => a.y - b.y || a.x - b.x)
                        .map((d) => d.text)
                        .join(' ');
                    const talle = talleItems[0]?.text || '';
                    const color = colorItems
                        .sort((a, b) => a.y - b.y || a.x - b.x)
                        .map((c) => c.text)
                        .join(' ');

                    machineEntries.push({
                        machine: mNum,
                        articleRaw: art.text,
                        descRaw: desc,
                        colorRaw: color,
                        talle: talle,
                        page: p,
                        file: filename,
                        date: fileDate,
                        shift: fileShift,
                        area: fileArea,
                    });
                } else {
                    // Múltiples artículos en la celda (cambio programado a las 08:00 AM)
                    artItems.sort((a, b) => a.y - b.y);
                    for (let j = 0; j < artItems.length; j++) {
                        const art = artItems[j];
                        const prevArtY = j > 0 ? artItems[j - 1].y : yTop;
                        const nextArtY = j < artItems.length - 1 ? artItems[j + 1].y : yBottom;
                        const subYTop = (prevArtY + art.y) / 2;
                        const subYBottom = (art.y + nextArtY) / 2;

                        const subDesc = descItems
                            .filter((d) => d.y >= subYTop && d.y < subYBottom)
                            .sort((a, b) => a.y - b.y || a.x - b.x)
                            .map((d) => d.text)
                            .join(' ');
                        const subTalle = talleItems.filter((t) => t.y >= subYTop && t.y < subYBottom)[0]?.text || '';
                        const subColor = colorItems
                            .filter((c) => c.y >= subYTop && c.y < subYBottom)
                            .sort((a, b) => a.y - b.y || a.x - b.x)
                            .map((c) => c.text)
                            .join(' ');

                        machineEntries.push({
                            machine: mNum,
                            articleRaw: art.text,
                            descRaw: subDesc || descItems.map((d) => d.text).join(' '),
                            colorRaw: subColor || colorItems.map((c) => c.text).join(' '),
                            talle: subTalle || talleItems[0]?.text || '',
                            page: p,
                            file: filename,
                            date: fileDate,
                            shift: fileShift,
                            area: fileArea,
                        });
                    }
                }
            }
        }

        return machineEntries;
    }

    private cleanArtCode(rawArt: string): { code: string; talle: string } {
        if (!rawArt) return { code: '', talle: '' };
        const rawClean = rawArt.trim().replace(/-\s+/g, '-').replace(/\s+-/g, '-');
        const tokens = rawClean.split(/\s+/);
        if (tokens.length === 0) return { code: '', talle: '' };

        const possibleTalles = ['KXS', 'KS', 'KM', 'KL', 'KXL', 'KXXL', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '1', '2', '3', '4', '5'];
        const sizeNormMap: Record<string, string> = { LG: 'L', MD: 'M', SM: 'S', KXK: 'KXL' };

        let codeToken = tokens[0];
        let talleToken = '';

        // Patrón Under Armour: 7 dígitos + 3 dígitos (e.g. "6009617 100")
        if (tokens.length >= 2 && /^\d{7}$/.test(tokens[0]) && /^\d{3}$/.test(tokens[1])) {
            codeToken = `${tokens[0]}-${tokens[1]}`;
            if (tokens.length >= 3) {
                const sTok = sizeNormMap[tokens[2].toUpperCase()] || tokens[2].toUpperCase();
                if (possibleTalles.includes(sTok)) {
                    talleToken = sTok;
                }
            }
        } else if (tokens.length > 1) {
            for (let i = tokens.length - 1; i >= 1; i--) {
                const tok = sizeNormMap[tokens[i].toUpperCase()] || tokens[i].toUpperCase();
                if (possibleTalles.includes(tok)) {
                    talleToken = tok;
                    break;
                }
            }
            if (!talleToken && possibleTalles.includes(sizeNormMap[tokens[1].toUpperCase()] || tokens[1].toUpperCase())) {
                talleToken = sizeNormMap[tokens[1].toUpperCase()] || tokens[1].toUpperCase();
            }
        }

        // Si el código contiene guiones como SX7677-964-XL-N
        if (codeToken.includes('-')) {
            const sub = codeToken.split('-');
            if (sub.length >= 3) {
                const sTok = sizeNormMap[sub[2].toUpperCase()] || sub[2].toUpperCase();
                if (possibleTalles.includes(sTok)) {
                    talleToken = sTok;
                    codeToken = `${sub[0]}-${sub[1]}`;
                }
            }
        }

        return { code: codeToken, talle: talleToken };
    }

    private inferMarca(desc?: string, code?: string): string {
        const text = `${desc || ''} ${code || ''}`.toUpperCase();
        if (text.includes('NIKE') || text.includes('U NK') || text.startsWith('SX') || text.startsWith('DH')) return 'NIKE';
        if (
            text.includes('ADIDAS') ||
            text.includes('3S ') ||
            text.startsWith('IC') ||
            text.startsWith('JV') ||
            text.startsWith('JZ') ||
            text.startsWith('KB') ||
            text.startsWith('KC') ||
            text.startsWith('KD') ||
            text.startsWith('KE') ||
            text.startsWith('HT') ||
            text.startsWith('IB')
        )
            return 'ADIDAS';
        if (text.includes('VANS') || text.includes('CLASSIC') || text.startsWith('VN000')) return 'VANS';
        if (text.includes('UNDER ARMOUR') || text.includes('ARMOUR') || text.startsWith('1367') || text.startsWith('6009') || text.startsWith('6015'))
            return 'UNDER ARMOUR';
        return 'GENÉRICO';
    }

    /**
     * Proyección de corte de proveedor para hilados críticos basada en prioridades de equivalencia
     * y consumo histórico configurable (1 a 12 meses).
     */
    async getCorteProveedor(categoria?: string, meses = 3): Promise<{
        categoriasDisponibles: string[];
        categoriaSeleccionada: string;
        mesesAnalizados: number;
        mensajeCorte: string;
        diasParaCorte: number | null;
        fechaProyectadaCorte: string | null;
        alertaCritica: boolean;
        materialActual: any;
        proximoMaterial: any;
        cadenaPrioridades: any[];
    }> {
        await this.ensureSchemaAndSeed();
        const safeMeses = Math.min(12, Math.max(1, Number(meses) || 3));
        const diasPeriodo = safeMeses * 30;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - diasPeriodo);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10);

        const defaultCats = [
            'Algodón Blanco',
            'Algodón Negro',
            'Goma Blanca',
            'Goma Negra',
            'Lycra Blanca',
            'Lycra Negra',
            'Poliamida Cruda',
            'Poliamida Negra',
        ];

        const dbCats = await this.dataSource.query(`
            SELECT DISTINCT ic.nombre 
            FROM item_categories ic
            JOIN items i ON i."categoryId" = ic.id
            WHERE i.activo = true AND ic.activo = true
            ORDER BY ic.nombre ASC
        `);

        const catNamesFromDb: string[] = dbCats.map((r: any) => r.nombre).filter(Boolean);
        const allAvailableSet = new Set<string>([...defaultCats, ...catNamesFromDb]);
        const categoriasDisponibles = Array.from(allAvailableSet);

        const catSeleccionada = categoria && categoria.trim() ? categoria.trim() : 'Algodón Negro';
        const tokens = catSeleccionada.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
        const likeConditions: string[] = [];
        const params: any[] = [];
        let pIndex = 1;

        for (const tok of tokens) {
            params.push(`%${tok}%`);
            likeConditions.push(`(
                LOWER(COALESCE(ic.nombre, '')) LIKE $${pIndex} 
                OR LOWER(i.descripcion) LIKE $${pIndex} 
                OR LOWER(i."codigoInterno") LIKE $${pIndex}
            )`);
            pIndex++;
        }

        const whereCatSql = likeConditions.length > 0 ? likeConditions.join(' AND ') : '1=1';

        const itemsRows = await this.dataSource.query(`
            SELECT 
                i.id AS "itemId",
                i."codigoInterno" AS codigo,
                i.descripcion,
                COALESCE(p.name, 'Sin Proveedor') AS proveedor,
                COALESCE(aie."ordenPrioridad", 1) AS "ordenPrioridad",
                COALESCE(SUM(sb."qtyPrincipal"), 0)::float AS "stockTotalKg",
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(pos.categoria, '')) = 'PICKING' THEN sb."qtyPrincipal" ELSE 0 END), 0)::float AS "stockPickingKg",
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(pos.categoria, '')) != 'PICKING' OR pos.categoria IS NULL THEN sb."qtyPrincipal" ELSE 0 END), 0)::float AS "stockDepositoKg",
                COALESCE(i."stockMinimo", 0)::float AS "stockMinimo"
            FROM items i
            LEFT JOIN partners p ON p.id = i."supplierId"
            LEFT JOIN articulo_item_equivalencias aie ON aie."itemId" = i.id AND aie.activo = true
            LEFT JOIN item_categories ic ON ic.id = i."categoryId"
            LEFT JOIN stock_balance sb ON sb."itemId" = i.id AND sb."qtyPrincipal" > 0
            LEFT JOIN positions pos ON pos.id = sb."posicionId"
            WHERE i.activo = true
              AND (${whereCatSql})
            GROUP BY i.id, i."codigoInterno", i.descripcion, p.name, aie."ordenPrioridad", i."stockMinimo"
            ORDER BY COALESCE(aie."ordenPrioridad", 1) ASC, i.descripcion ASC
        `, params);

        let finalRows = itemsRows;
        if (finalRows.length === 0 && tokens.length > 0) {
            finalRows = await this.dataSource.query(`
                SELECT 
                    i.id AS "itemId",
                    i."codigoInterno" AS codigo,
                    i.descripcion,
                    COALESCE(p.name, 'Sin Proveedor') AS proveedor,
                    COALESCE(aie."ordenPrioridad", 1) AS "ordenPrioridad",
                    COALESCE(SUM(sb."qtyPrincipal"), 0)::float AS "stockTotalKg",
                    COALESCE(SUM(CASE WHEN UPPER(COALESCE(pos.categoria, '')) = 'PICKING' THEN sb."qtyPrincipal" ELSE 0 END), 0)::float AS "stockPickingKg",
                    COALESCE(SUM(CASE WHEN UPPER(COALESCE(pos.categoria, '')) != 'PICKING' OR pos.categoria IS NULL THEN sb."qtyPrincipal" ELSE 0 END), 0)::float AS "stockDepositoKg",
                    COALESCE(i."stockMinimo", 0)::float AS "stockMinimo"
                FROM items i
                LEFT JOIN partners p ON p.id = i."supplierId"
                LEFT JOIN articulo_item_equivalencias aie ON aie."itemId" = i.id AND aie.activo = true
                LEFT JOIN item_categories ic ON ic.id = i."categoryId"
                LEFT JOIN stock_balance sb ON sb."itemId" = i.id AND sb."qtyPrincipal" > 0
                LEFT JOIN positions pos ON pos.id = sb."posicionId"
                WHERE i.activo = true
                  AND (LOWER(COALESCE(ic.nombre, '')) LIKE $1 OR LOWER(i.descripcion) LIKE $1)
                GROUP BY i.id, i."codigoInterno", i.descripcion, p.name, aie."ordenPrioridad", i."stockMinimo"
                ORDER BY COALESCE(aie."ordenPrioridad", 1) ASC, i.descripcion ASC
            `, [`%${tokens[0]}%`]);
        }

        const itemIds = finalRows.map((r: any) => r.itemId);
        const consumoMap = new Map<string, number>();

        if (itemIds.length > 0) {
            const consumos = await this.dataSource.query(`
                SELECT 
                    m."itemId",
                    COALESCE(SUM(m."qtyPrincipal"), 0)::float AS "totalConsumo"
                FROM movimientos m
                WHERE m.status = 'ACTIVO'
                  AND m.tipo = 'REMITO_SALIDA'
                  AND m.fecha >= $1
                  AND m."itemId" = ANY($2)
                GROUP BY m."itemId"
            `, [cutoffStr, itemIds]);

            for (const c of consumos) {
                consumoMap.set(c.itemId, Number(c.totalConsumo || 0));
            }
        }

        const cadenaPrioridades = finalRows.map((row: any, idx: number) => {
            const stockTotal = Number(row.stockTotalKg || 0);
            const consumoTotal = consumoMap.get(row.itemId) || 0;
            const consumoDiario = Math.round((consumoTotal / diasPeriodo) * 100) / 100;
            const diasRestantes = consumoDiario > 0 ? Math.round((stockTotal / consumoDiario) * 10) / 10 : null;

            return {
                itemId: row.itemId,
                codigo: row.codigo,
                descripcion: row.descripcion,
                proveedor: row.proveedor,
                ordenPrioridad: Number(row.ordenPrioridad || idx + 1),
                stockTotalKg: Math.round(stockTotal * 100) / 100,
                stockPickingKg: Math.round(Number(row.stockPickingKg || 0) * 100) / 100,
                stockDepositoKg: Math.round(Number(row.stockDepositoKg || 0) * 100) / 100,
                stockMinimo: Number(row.stockMinimo || 0),
                consumoHistoricoKg: Math.round(consumoTotal * 100) / 100,
                consumoPromedioDiarioKg: consumoDiario,
                diasRestantes,
                alertaMinimo: Number(row.stockDepositoKg || 0) < Number(row.stockMinimo || 0),
            };
        });

        const prio1 = cadenaPrioridades[0] || null;
        const prio2 = cadenaPrioridades[1] || null;

        let mensajeCorte = '';
        let diasParaCorte: number | null = null;
        let fechaProyectadaCorte: string | null = null;
        let alertaCritica = false;

        if (!prio1) {
            mensajeCorte = `No se encontraron materiales activos configurados para la categoría "${catSeleccionada}".`;
        } else if (prio1.stockTotalKg <= 0) {
            alertaCritica = true;
            if (prio2) {
                mensajeCorte = `⚠️ El material prioridad 1 (${prio1.codigo} - ${prio1.proveedor}) está AGOTADO (0 kg). El consumo actual pasó al material prioridad 2 (${prio2.codigo} - ${prio2.proveedor}).`;
                diasParaCorte = 0;
            } else {
                mensajeCorte = `⚠️ El material prioridad 1 (${prio1.codigo} - ${prio1.proveedor}) está AGOTADO (0 kg) y no hay material prioridad 2 definido para esta categoría.`;
                diasParaCorte = 0;
            }
        } else if (prio1.consumoPromedioDiarioKg > 0) {
            diasParaCorte = Math.ceil(prio1.stockTotalKg / prio1.consumoPromedioDiarioKg);
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + diasParaCorte);
            fechaProyectadaCorte = targetDate.toLocaleDateString('es-AR');

            if (prio2) {
                mensajeCorte = `En ${diasParaCorte} días se agota ${prio1.descripcion} (${prio1.proveedor}, Prioridad 1) y se pasa al material Prioridad 2: ${prio2.descripcion} (${prio2.proveedor}).`;
            } else {
                mensajeCorte = `En ${diasParaCorte} días se agota el stock disponible de ${prio1.descripcion} (${prio1.proveedor}) a una tasa promedio de ${prio1.consumoPromedioDiarioKg} kg/día.`;
            }
            if (diasParaCorte <= 7) alertaCritica = true;
        } else {
            mensajeCorte = `El material prioridad 1 (${prio1.codigo} - ${prio1.proveedor}) tiene ${prio1.stockTotalKg.toLocaleString('es-AR')} kg en stock sin consumo registrado en los últimos ${safeMeses} meses.`;
        }

        return {
            categoriasDisponibles,
            categoriaSeleccionada: catSeleccionada,
            mesesAnalizados: safeMeses,
            mensajeCorte,
            diasParaCorte,
            fechaProyectadaCorte,
            alertaCritica,
            materialActual: prio1,
            proximoMaterial: prio2,
            cadenaPrioridades,
        };
    }
}
