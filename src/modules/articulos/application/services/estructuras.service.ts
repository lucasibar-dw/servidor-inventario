import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ArticuloEstructuraEntity } from '../../infrastructure/persistence/entities/articulo-estructura.entity';
import { ArticuloEntity } from '../../infrastructure/persistence/entities/articulo.entity';

export interface ComponenteExplosion {
    codigoComponente: string;
    articuloHijoId?: string | null;
    descripcionInsumo?: string | null;
    tipo?: string | null;
    etapa?: string | null;
    unidadMedida?: string | null;
    cantidadUnitaria: number;
    cantidadSecundaria?: number | null;
    cantidadTotal: number;
    nivel: number;
    posicion?: string | null;
    estadoRevision?: string | null;
    detalleRevision?: string | null;
    equivalencias?: Array<{
        id: string;
        itemId: string;
        codigoItem: string;
        descripcionItem: string;
        ordenPrioridad: number;
        esPrincipal: boolean;
        stockActual: number;
    }>;
    maquinas?: Array<{
        machineTypeId: string;
        machineTypeName: string;
        marca: string;
        modelo: string;
        cantAgujas: number;
        cilindro: number;
        cycleTimeSeconds: number;
        status: string;
        preferida: boolean;
    }>;
    hijos?: ComponenteExplosion[];
}

@Injectable()
export class EstructurasService {
    constructor(
        @InjectRepository(ArticuloEstructuraEntity)
        private readonly estructuraRepo: Repository<ArticuloEstructuraEntity>,
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
        private readonly dataSource: DataSource,
    ) { }

    private static tablaVerificada = false;

    async asegurarTablaEstructuras(): Promise<void> {
        if (EstructurasService.tablaVerificada) return;

        await this.dataSource.query(`
            CREATE TABLE IF NOT EXISTS "articulo_estructuras" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "codigoPadre" character varying(50) NOT NULL,
                "codigoComponente" character varying(50) NOT NULL,
                "articuloPadreId" uuid,
                "articuloHijoId" uuid,
                "cantidad" numeric(14,6) NOT NULL,
                "cantidadSecundaria" numeric(14,6),
                "observacion" text,
                "descripcionInsumo" character varying(255),
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_articulo_estructuras_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_articulo_estructuras_padre_componente" UNIQUE ("codigoPadre", "codigoComponente")
            );

            CREATE INDEX IF NOT EXISTS "IDX_articulo_estructuras_padre" ON "articulo_estructuras" ("codigoPadre");
            CREATE INDEX IF NOT EXISTS "IDX_articulo_estructuras_componente" ON "articulo_estructuras" ("codigoComponente");
            ALTER TABLE IF EXISTS "articulo_estructuras" ADD COLUMN IF NOT EXISTS "descripcionInsumo" character varying(255);
        `);

        EstructurasService.tablaVerificada = true;
    }

    async findByPadre(codigoPadre: string): Promise<any[]> {
        const codigoUpper = codigoPadre.trim().toUpperCase();
        const rows = await this.dataSource.query(`
            SELECT
                e.id,
                e."codigoPadre",
                e."codigoComponente",
                COALESCE(e."articuloPadreId", ap.id) AS "articuloPadreId",
                COALESCE(e."articuloHijoId", a.id) AS "articuloHijoId",
                e."cantidad",
                e."cantidadSecundaria",
                e."observacion",
                e."activo",
                COALESCE(a."descripcion", e."descripcionInsumo", e."codigoComponente") AS "descripcionInsumo",
                a."etapa" AS "etapaComponente",
                a."familia" AS "familiaComponente",
                a."tipo" AS "tipoComponente",
                a."unidadMedida" AS "unidadComponente",
                a."unidadMedida" AS "unidadMedidaComponente",
                a."estado" AS "estadoComponente",
                (SELECT COUNT(*) FROM articulo_estructuras sub WHERE sub."codigoPadre" = e."codigoComponente" AND sub."activo" = true)::int AS "subComponentesCount",
                (SELECT COUNT(*) FROM articulo_item_equivalencias eq WHERE eq."articuloId" = a.id AND eq."activo" = true)::int AS "equivalenciasCount"
            FROM articulo_estructuras e
            LEFT JOIN articulos a ON a."codigo" = e."codigoComponente"
            LEFT JOIN articulos ap ON ap."codigo" = e."codigoPadre"
            WHERE UPPER(e."codigoPadre") = $1 AND e."activo" = true
            ORDER BY
                CASE a."etapa"
                    WHEN 'COSTURA' THEN 1
                    WHEN 'TEJIDO' THEN 2
                    WHEN 'HILADO' THEN 3
                    WHEN 'INSUMO' THEN 4
                    ELSE 5
                END,
                e."codigoComponente" ASC
        `, [codigoUpper]);
        return rows;
    }

    /**
     * Agrega o actualiza una línea individual en articulo_estructuras
     */
    async upsertLineaEstructura(dto: {
        codigoPadre: string;
        codigoComponente: string;
        cantidad: number;
        cantidadSecundaria?: number | null;
        observacion?: string | null;
    }) {
        const padreCod = (dto.codigoPadre || '').trim().toUpperCase();
        const compCod = (dto.codigoComponente || '').trim().toUpperCase();
        const cant = Number(dto.cantidad);

        if (!padreCod || !compCod) {
            throw new NotFoundException('Debe indicar código padre y código componente.');
        }
        if (padreCod === compCod) {
            throw new NotFoundException('Un artículo no puede ser componente de sí mismo.');
        }
        if (!Number.isFinite(cant) || cant < 0) {
            throw new NotFoundException('La cantidad debe ser un número mayor o igual a 0.');
        }

        const [padre, hijo] = await Promise.all([
            this.articuloRepo.findOne({ where: { codigo: padreCod } }),
            this.articuloRepo.findOne({ where: { codigo: compCod } }),
        ]);

        if (!padre) {
            throw new NotFoundException(`El artículo padre "${padreCod}" no existe.`);
        }
        if (!hijo) {
            throw new NotFoundException(`El artículo componente "${compCod}" no existe. Crealo primero en el catálogo.`);
        }

        let linea = await this.estructuraRepo.findOne({
            where: { codigoPadre: padreCod, codigoComponente: compCod },
        });

        if (!linea) {
            linea = this.estructuraRepo.create({
                codigoPadre: padreCod,
                codigoComponente: compCod,
                articuloPadreId: padre.id,
                articuloHijoId: hijo.id,
                cantidad: cant,
                cantidadSecundaria: dto.cantidadSecundaria != null ? Number(dto.cantidadSecundaria) : null,
                observacion: dto.observacion || null,
                descripcionInsumo: hijo.descripcion,
                activo: true,
            });
        } else {
            linea.cantidad = cant;
            linea.cantidadSecundaria = dto.cantidadSecundaria != null ? Number(dto.cantidadSecundaria) : linea.cantidadSecundaria;
            if (dto.observacion !== undefined) linea.observacion = dto.observacion;
            linea.articuloPadreId = padre.id;
            linea.articuloHijoId = hijo.id;
            linea.descripcionInsumo = hijo.descripcion;
            linea.activo = true;
        }

        return this.estructuraRepo.save(linea);
    }

    /**
     * Desactiva o elimina una línea de estructura por su ID
     */
    async eliminarLineaEstructura(id: string) {
        const linea = await this.estructuraRepo.findOne({ where: { id } });
        if (!linea) {
            throw new NotFoundException('Línea de estructura no encontrada.');
        }
        await this.estructuraRepo.delete(id);
        return { success: true };
    }

    /**
     * Explosión multinivel de la estructura para una cantidad dada del producto padre.
     */
    async explotarEstructura(
        codigoPadre: string,
        cantidadPadre: number = 1,
        nivelActual: number = 1,
        visitados: Set<string> = new Set(),
    ): Promise<ComponenteExplosion[]> {
        const codigoPadreUpper = codigoPadre.trim().toUpperCase();

        // Evitar ciclos infinitos
        if (visitados.has(codigoPadreUpper)) {
            return [];
        }
        const nuevosVisitados = new Set(visitados);
        nuevosVisitados.add(codigoPadreUpper);

        const componentes = await this.findByPadre(codigoPadreUpper);
        const resultado: ComponenteExplosion[] = [];

        for (const comp of componentes) {
            const cantUnitaria = Number(comp.cantidad);
            const cantTotal = cantUnitaria * cantidadPadre;

            // Consultar si este componente a su vez tiene subestructura (multinivel)
            const subHijos = await this.explotarEstructura(
                comp.codigoComponente,
                cantTotal,
                nivelActual + 1,
                nuevosVisitados,
            );

            // Si es HILADO o INSUMO, traer sus equivalencias de depósito y stock actual
            let equivalencias: any[] | undefined;
            if (comp.articuloHijoId && (comp.etapaComponente === 'HILADO' || comp.etapaComponente === 'INSUMO' || comp.equivalenciasCount > 0)) {
                equivalencias = await this.dataSource.query(`
                    SELECT
                        eq.id,
                        eq."itemId",
                        eq."codigoItem",
                        i.descripcion AS "descripcionItem",
                        eq."ordenPrioridad",
                        eq."esPrincipal",
                        COALESCE((SELECT SUM(sb."qtyPrincipal") FROM stock_balance sb WHERE sb."itemId" = eq."itemId"), 0)::numeric AS "stockActual"
                    FROM articulo_item_equivalencias eq
                    LEFT JOIN items i ON i.id = eq."itemId"
                    WHERE eq."articuloId" = $1 AND eq."activo" = true
                    ORDER BY eq."ordenPrioridad" ASC
                `, [comp.articuloHijoId]);
            }

            // Si es TEJIDO (o tiene máquinas asignadas), traer sus máquinas y tiempos
            let maquinas: any[] | undefined;
            if (comp.articuloHijoId && comp.etapaComponente === 'TEJIDO') {
                maquinas = await this.dataSource.query(`
                    SELECT
                        amt."machineTypeId",
                        mt.name AS "machineTypeName",
                        mt.marca,
                        mt.modelo,
                        mt.cant_agujas AS "cantAgujas",
                        mt.cilindro,
                        amt."cycleTimeSeconds",
                        amt."status",
                        COALESCE(amt."preferida", false) AS "preferida"
                    FROM articulo_machine_types amt
                    JOIN machine_types mt ON mt.id = amt."machineTypeId"
                    WHERE amt."articuloId" = $1
                    ORDER BY COALESCE(amt."preferida", false) DESC, amt."cycleTimeSeconds" ASC NULLS LAST
                `, [comp.articuloHijoId]);
            }

            resultado.push({
                codigoComponente: comp.codigoComponente,
                articuloHijoId: comp.articuloHijoId,
                descripcionInsumo: comp.descripcionInsumo,
                tipo: comp.tipoComponente,
                etapa: comp.etapaComponente,
                unidadMedida: comp.unidadComponente,
                cantidadUnitaria: cantUnitaria,
                cantidadSecundaria: comp.cantidadSecundaria != null ? Number(comp.cantidadSecundaria) : null,
                cantidadTotal: Number(cantTotal.toFixed(6)),
                nivel: nivelActual,
                posicion: comp.posicion,
                equivalencias: equivalencias && equivalencias.length > 0 ? equivalencias : undefined,
                maquinas: maquinas && maquinas.length > 0 ? maquinas : undefined,
                hijos: subHijos.length > 0 ? subHijos : undefined,
            });
        }

        return resultado;
    }

    /**
     * Simulador / Explosión consolidada para una cantidad a producir de un artículo:
     * devuelve los materiales (hilados e insumos) sumados, su stock en depósito,
     * si alcanza o falta comprar, y las horas/turnos de máquina requeridos.
     */
    async simularNecesidades(codigoPadre: string, cantidad: number = 1) {
        const padre = await this.articuloRepo.findOne({
            where: { codigo: codigoPadre.trim().toUpperCase() },
        });
        if (!padre) {
            throw new NotFoundException(`Artículo "${codigoPadre}" no encontrado.`);
        }

        const arbol = await this.explotarEstructura(padre.codigo, cantidad);

        const materialesMap = new Map<string, {
            codigoComponente: string;
            articuloHijoId?: string | null;
            descripcion: string;
            etapa: string;
            unidadMedida: string;
            cantidadTotal: number;
            sinCantidadEnBOM: boolean;
            equivalencias: any[];
            stockTotalDisponible: number;
            faltante: number;
            alertaSinItem: boolean;
        }>();

        const etapasTejido: Array<{
            codigoTejido: string;
            descripcion: string;
            cantidadTejer: number;
            maquinas: any[];
            horasEnPreferida: number | null;
            turnos8hEnPreferida: number | null;
        }> = [];

        const recorrer = (nodos: ComponenteExplosion[]) => {
            for (const n of nodos) {
                if (n.etapa === 'TEJIDO') {
                    const pref = (n.maquinas || []).find((m) => m.preferida) || (n.maquinas || [])[0];
                    const sec = pref ? Number(pref.cycleTimeSeconds || 0) : 0;
                    const horas = sec > 0 ? Number(((n.cantidadTotal * sec) / 3600).toFixed(2)) : null;
                    etapasTejido.push({
                        codigoTejido: n.codigoComponente,
                        descripcion: n.descripcionInsumo || n.codigoComponente,
                        cantidadTejer: n.cantidadTotal,
                        maquinas: n.maquinas || [],
                        horasEnPreferida: horas,
                        turnos8hEnPreferida: horas != null ? Number((horas / 8).toFixed(2)) : null,
                    });
                }

                if (!n.hijos || n.hijos.length === 0) {
                    const key = n.codigoComponente;
                    const eqs = n.equivalencias || [];
                    const stockDisp = eqs.reduce((acc, e) => acc + Number(e.stockActual || 0), 0);
                    const prev = materialesMap.get(key);
                    const nuevaCant = Number(((prev?.cantidadTotal || 0) + n.cantidadTotal).toFixed(4));
                    const faltante = Math.max(0, Number((nuevaCant - stockDisp).toFixed(4)));

                    materialesMap.set(key, {
                        codigoComponente: key,
                        articuloHijoId: n.articuloHijoId,
                        descripcion: n.descripcionInsumo || key,
                        etapa: n.etapa || 'INSUMO',
                        unidadMedida: n.unidadMedida || (n.etapa === 'HILADO' ? 'KG' : 'UN'),
                        cantidadTotal: nuevaCant,
                        sinCantidadEnBOM: n.cantidadUnitaria === 0,
                        equivalencias: eqs,
                        stockTotalDisponible: Number(stockDisp.toFixed(2)),
                        faltante,
                        alertaSinItem: n.etapa === 'HILADO' && eqs.length === 0,
                    });
                } else {
                    recorrer(n.hijos);
                }
            }
        };

        // Si el artículo consultado ya es un TEJIDO, incluir sus propias máquinas
        if (padre.etapa === 'TEJIDO') {
            const maquinasPropias = await this.dataSource.query(`
                SELECT
                    amt."machineTypeId",
                    mt.name AS "machineTypeName",
                    mt.marca,
                    mt.modelo,
                    mt.cant_agujas AS "cantAgujas",
                    mt.cilindro,
                    amt."cycleTimeSeconds",
                    amt."status",
                    COALESCE(amt."preferida", false) AS "preferida"
                FROM articulo_machine_types amt
                JOIN machine_types mt ON mt.id = amt."machineTypeId"
                WHERE amt."articuloId" = $1
                ORDER BY COALESCE(amt."preferida", false) DESC, amt."cycleTimeSeconds" ASC NULLS LAST
            `, [padre.id]);
            const pref = maquinasPropias.find((m: any) => m.preferida) || maquinasPropias[0];
            const sec = pref ? Number(pref.cycleTimeSeconds || 0) : 0;
            const horas = sec > 0 ? Number(((cantidad * sec) / 3600).toFixed(2)) : null;
            etapasTejido.push({
                codigoTejido: padre.codigo,
                descripcion: padre.descripcion,
                cantidadTejer: cantidad,
                maquinas: maquinasPropias,
                horasEnPreferida: horas,
                turnos8hEnPreferida: horas != null ? Number((horas / 8).toFixed(2)) : null,
            });
        }

        recorrer(arbol);

        const materiales = Array.from(materialesMap.values());
        const hiladosRaw = materiales.filter((m) => m.etapa === 'HILADO');
        const insumosRaw = materiales.filter((m) => m.etapa !== 'HILADO');

        const hiladosNecesarios = hiladosRaw.map((h) => ({
            codigoArticulo: h.codigoComponente,
            articuloId: h.articuloHijoId || null,
            descripcion: h.descripcion,
            unidadMedida: h.unidadMedida || 'KG',
            cantidadTotalRequerida: h.cantidadTotal,
            stockTotalDisponible: h.stockTotalDisponible,
            faltante: h.faltante,
            alcanzaStock: !h.alertaSinItem && h.faltante <= 0,
            sinEquivalenciaEnDeposito: h.alertaSinItem,
            itemsEquivalentes: (h.equivalencias || []).map((eq: any) => ({
                ordenPrioridad: Number(eq.ordenPrioridad || 1),
                esPrincipal: Boolean(eq.esPrincipal),
                codigoItem: eq.codigoItem,
                descripcionItem: eq.descripcionItem || eq.codigoItem,
                stockActual: Number(eq.stockActual || 0),
                factorConversion: Number(eq.factorConversion || 1),
            })),
        }));

        const insumosNecesarios = insumosRaw.map((ins) => ({
            codigoArticulo: ins.codigoComponente,
            articuloId: ins.articuloHijoId || null,
            descripcion: ins.descripcion,
            etapa: ins.etapa || 'INSUMO',
            unidadMedida: ins.unidadMedida || 'UN',
            cantidadTotalRequerida: ins.cantidadTotal,
            sinCantidadDefinida: ins.sinCantidadEnBOM,
            stockTotalDisponible: ins.stockTotalDisponible,
            equivalenciasCount: (ins.equivalencias || []).length,
        }));

        const tejidoMaquinas = etapasTejido.map((et) => ({
            codigoTejido: et.codigoTejido,
            descripcionTejido: et.descripcion,
            unidadesATejer: et.cantidadTejer,
            sinMaquinaAsignada: !et.maquinas || et.maquinas.length === 0,
            opcionesMaquina: (et.maquinas || []).map((m: any) => {
                const sec = Number(m.cycleTimeSeconds || 0);
                const horasTotales = sec > 0 ? Number(((et.cantidadTejer * sec) / 3600).toFixed(2)) : 0;
                const turnos8h = Number((horasTotales / 8).toFixed(2));
                return {
                    machineTypeId: m.machineTypeId,
                    machineTypeName: m.machineTypeName,
                    preferida: Boolean(m.preferida),
                    cycleTimeSeconds: sec,
                    status: m.status || 'ESTIMADO',
                    horasTotales,
                    turnos8h,
                };
            }),
        }));

        return {
            codigoPadre: padre.codigo,
            descripcionPadre: padre.descripcion,
            etapaPadre: padre.etapa || null,
            articulo: {
                id: padre.id,
                codigo: padre.codigo,
                descripcion: padre.descripcion,
                etapa: padre.etapa,
                familia: padre.familia,
                marca: padre.marca,
                talle: padre.talle,
                destino: padre.destino,
            },
            cantidadSolicitada: cantidad,
            resumenHiladosKg: Number(
                hiladosRaw
                    .reduce((acc, m) => acc + m.cantidadTotal, 0)
                    .toFixed(3),
            ),
            hiladosNecesarios,
            insumosNecesarios,
            tejidoMaquinas,
            hilados: hiladosRaw,
            insumos: insumosRaw,
            etapasTejido,
            arbol,
        };
    }

    /**
     * Inserción / actualización masiva idempotente (upsert) de estructuras.
     * Si una relación ya existe, pisa sus cantidades, fechas y observaciones con la nueva versión.
     */
    async seedBatch(
        items: Array<Partial<ArticuloEstructuraEntity>>,
    ): Promise<{ procesados: number; creados: number; actualizados: number }> {
        await this.asegurarTablaEstructuras();

        let creados = 0;
        let actualizados = 0;

        await this.dataSource.transaction(async (manager) => {
            for (const item of items) {
                if (!item.codigoPadre || !item.codigoComponente) continue;

                const codigoPadre = String(item.codigoPadre).trim().toUpperCase();
                const codigoComponente = String(item.codigoComponente).trim().toUpperCase();
                const cantidad = Number(item.cantidad);

                if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

                let existing = await manager.findOne(ArticuloEstructuraEntity, {
                    where: { codigoPadre, codigoComponente },
                });

                if (!existing) {
                    const newEntity = manager.create(ArticuloEstructuraEntity, {
                        ...item,
                        codigoPadre,
                        codigoComponente,
                        cantidad,
                        activo: true,
                    });
                    await manager.save(ArticuloEstructuraEntity, newEntity);
                    creados++;
                } else {
                    // Pisar con la versión más reciente
                    Object.assign(existing, item, {
                        codigoPadre,
                        codigoComponente,
                        cantidad,
                    });
                    await manager.save(ArticuloEstructuraEntity, existing);
                    actualizados++;
                }
            }
        });

        return { procesados: creados + actualizados, creados, actualizados };
    }

    /**
     * Obtiene artículos (generalmente PA o activos) que no tienen ninguna estructura
     * cargada en articulo_estructuras (como codigoPadre).
     */
    async findPendientesEstructura(options?: {
        search?: string;
        tipo?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        items: Array<{
            id: string;
            codigo: string;
            descripcion: string;
            tipo: string;
            unidadMedida: string;
            marca?: string;
            talle?: string;
            articuloGenerico?: string;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        await this.asegurarTablaEstructuras();

        const page = Math.max(1, Number(options?.page || 1));
        const limit = Math.min(100, Math.max(1, Number(options?.limit || 20)));
        const offset = (page - 1) * limit;

        const tipo = options?.tipo || 'TERMINADO';
        const search = options?.search ? `%${options.search.trim()}%` : null;

        let query = `
            SELECT a.id, a.codigo, a.descripcion, a.tipo, a.etapa, a.familia, a.modelo, a.destino, a."unidadMedida", a.marca, a.talle, a."articuloGenerico"
            FROM articulos a
            LEFT JOIN articulo_estructuras ae ON UPPER(ae."codigoPadre") = UPPER(a.codigo) AND ae.activo = true
            WHERE ae.id IS NULL
        `;

        const params: any[] = [];
        let pIdx = 1;

        if (tipo && tipo !== 'TODOS') {
            if (['TERMINADO', 'COSTURA', 'TEJIDO'].includes(tipo.toUpperCase())) {
                query += ` AND a.etapa = $${pIdx++}`;
                params.push(tipo.toUpperCase());
            } else {
                query += ` AND a.tipo = $${pIdx++}`;
                params.push(tipo.toUpperCase());
            }
        }

        if (search) {
            query += ` AND (a.codigo ILIKE $${pIdx} OR a.descripcion ILIKE $${pIdx})`;
            params.push(search);
            pIdx++;
        }

        const countQuery = `SELECT COUNT(*) as count FROM (${query}) sub`;
        const totalRes = await this.dataSource.query(countQuery, params);
        const total = parseInt(totalRes[0]?.count || '0', 10);

        query += ` ORDER BY a.codigo ASC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
        params.push(limit, offset);

        const items = await this.dataSource.query(query, params);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Guarda la estructura de un artículo, asegurando creación opcional del PI intermedio,
     * registro en articulo_estructuras y opcional vinculación de equivalencias de depósito.
     */
    async guardarEstructuraArbol(dto: {
        codigoPadre: string;
        productoIntermedio?: {
            codigoPI: string;
            descripcionPI?: string;
            cantidad?: number;
        };
        componentes: Array<{
            codigoComponente: string;
            descripcionInsumo?: string;
            cantidad: number;
            tipoFijoVariable?: string;
            itemIdEquivalente?: string; // Si se vincula directo con un item de almacén
            ordenPrioridad?: number;
        }>;
    }): Promise<{ success: boolean; componentesGuardados: number; piCreado: boolean }> {
        await this.asegurarTablaEstructuras();

        return this.dataSource.transaction(async (manager) => {
            const codigoPadre = dto.codigoPadre.trim().toUpperCase();

            // 1. Verificar artículo padre
            const padre = await manager.findOne(ArticuloEntity, {
                where: { codigo: codigoPadre },
            });

            let piCreado = false;
            let piCodigoFinal = dto.productoIntermedio?.codigoPI?.trim().toUpperCase();

            // 2. Si se especificó producto intermedio (PI)
            if (piCodigoFinal) {
                let piArticulo = await manager.findOne(ArticuloEntity, {
                    where: { codigo: piCodigoFinal },
                });

                if (!piArticulo) {
                    piArticulo = manager.create(ArticuloEntity, {
                        codigo: piCodigoFinal,
                        descripcion: dto.productoIntermedio?.descripcionPI || `PI ${codigoPadre}`,
                        tipo: 'PI',
                        unidadMedida: padre?.unidadMedida || 'PR',
                        marca: padre?.marca,
                        talle: padre?.talle,
                        activo: true,
                    });
                    await manager.save(ArticuloEntity, piArticulo);
                    piCreado = true;
                }

                // Relacionar Padre -> PI en articulo_estructuras
                const cantPI = Number(dto.productoIntermedio?.cantidad || 1);
                let estPadrePI = await manager.findOne(ArticuloEstructuraEntity, {
                    where: { codigoPadre, codigoComponente: piCodigoFinal },
                });

                if (!estPadrePI) {
                    estPadrePI = manager.create(ArticuloEstructuraEntity, {
                        codigoPadre,
                        codigoComponente: piCodigoFinal,
                        articuloPadreId: padre?.id || null,
                        articuloHijoId: piArticulo.id,
                        cantidad: cantPI,
                        descripcionInsumo: piArticulo.descripcion,
                        activo: true,
                    });
                } else {
                    estPadrePI.cantidad = cantPI;
                    estPadrePI.articuloPadreId = padre?.id || null;
                    estPadrePI.articuloHijoId = piArticulo.id;
                    estPadrePI.activo = true;
                }
                await manager.save(ArticuloEstructuraEntity, estPadrePI);
            }

            // 3. Guardar componentes (si hay PI van asociados al PI, de lo contrario al Padre)
            const codigoTarget = piCodigoFinal || codigoPadre;
            const targetArticulo = piCodigoFinal
                ? await manager.findOne(ArticuloEntity, { where: { codigo: piCodigoFinal } })
                : padre;

            let componentesGuardados = 0;

            for (const comp of dto.componentes || []) {
                const codComp = comp.codigoComponente.trim().toUpperCase();
                const cant = Number(comp.cantidad);
                if (!codComp || cant <= 0) continue;

                // Buscar o registrar componente en articulos (como MP si no existe)
                let compArt = await manager.findOne(ArticuloEntity, {
                    where: { codigo: codComp },
                });

                if (!compArt) {
                    compArt = manager.create(ArticuloEntity, {
                        codigo: codComp,
                        descripcion: comp.descripcionInsumo || codComp,
                        tipo: 'MP',
                        unidadMedida: 'KG',
                        activo: true,
                    });
                    await manager.save(ArticuloEntity, compArt);
                }

                let estComp = await manager.findOne(ArticuloEstructuraEntity, {
                    where: { codigoPadre: codigoTarget, codigoComponente: codComp },
                });

                if (!estComp) {
                    estComp = manager.create(ArticuloEstructuraEntity, {
                        codigoPadre: codigoTarget,
                        codigoComponente: codComp,
                        articuloPadreId: targetArticulo?.id || null,
                        articuloHijoId: compArt.id,
                        cantidad: cant,
                        descripcionInsumo: comp.descripcionInsumo || compArt.descripcion,
                        activo: true,
                    });
                } else {
                    estComp.cantidad = cant;
                    estComp.descripcionInsumo = comp.descripcionInsumo || compArt.descripcion;
                    estComp.articuloPadreId = targetArticulo?.id || null;
                    estComp.articuloHijoId = compArt.id;
                    estComp.activo = true;
                }
                await manager.save(ArticuloEstructuraEntity, estComp);
                componentesGuardados++;

                // 4. Si se especificó un itemId para equivalencia con depósito
                if (comp.itemIdEquivalente && compArt.id) {
                    // Verificar si ya existe en articulo_item_equivalencias
                    const equivExists = await manager.query(
                        `SELECT id FROM articulo_item_equivalencias WHERE "articuloId" = $1 AND "itemId" = $2`,
                        [compArt.id, comp.itemIdEquivalente]
                    );

                    if (!equivExists || equivExists.length === 0) {
                        const itemData = await manager.query(
                            `SELECT "codigoInterno" FROM items WHERE id = $1`,
                            [comp.itemIdEquivalente]
                        );
                        const itemCodigo = itemData[0]?.codigoInterno || '';

                        await manager.query(
                            `INSERT INTO articulo_item_equivalencias 
                             ("id", "articuloId", "codigoArticulo", "itemId", "codigoItem", "ordenPrioridad", "esPrincipal", "factorConversion", "activo", "createdAt", "updatedAt")
                             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1.0, true, NOW(), NOW())`,
                            [
                                compArt.id,
                                compArt.codigo,
                                comp.itemIdEquivalente,
                                itemCodigo,
                                comp.ordenPrioridad || 1,
                                (comp.ordenPrioridad || 1) === 1,
                            ]
                        );
                    }
                }
            }

            return {
                success: true,
                componentesGuardados,
                piCreado,
            };
        });
    }
}

