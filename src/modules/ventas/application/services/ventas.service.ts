import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

import { BalancePedidoVentaEntity, EstadoPedidoVenta } from '../../infrastructure/persistence/entities/balance-pedido-venta.entity';
import { MovimientoPedidoVentaEntity, TipoMovimientoPedidoVenta } from '../../infrastructure/persistence/entities/movimiento-pedido-venta.entity';
import { ArticuloEntity } from '../../../articulos/infrastructure/persistence/entities/articulo.entity';
import { ArticuloEstructuraEntity } from '../../../articulos/infrastructure/persistence/entities/articulo-estructura.entity';
import { MovimientoArticuloEntity, TipoMovimientoArticulo } from '../../../articulos/infrastructure/persistence/entities/movimiento-articulo.entity';

export interface FiltrosPedidosDto {
    cliente?: string;
    estado?: string;
    search?: string;
    soloPendientes?: boolean;
    soloSinEstructura?: boolean;
    page?: number;
    limit?: number;
}

export interface CrearPedidoDto {
    numeroPedido: string;
    cliente: string;
    destino?: string;
    fechaPedido?: string;
    fechaEntrega?: string;
    articuloCodigo: string;
    articuloDescripcion?: string;
    talle?: string;
    paresPorPack?: number;
    packsPedidas: number;
    prioridad?: string;
    observaciones?: string;
}

export interface AvanceEstadioDto {
    estadio: 'TEJIDO' | 'COCIDO' | 'PLANCHADO' | 'EMPAQUETADO' | 'ARMADO';
    cantidadPacks: number;
    usuarioId?: string;
    observaciones?: string;
}

export interface EmitirRemitoDto {
    numeroRemito: string;
    cantidadPacks: number;
    usuarioId?: string;
    observaciones?: string;
}

@Injectable()
export class VentasService {
    private readonly logger = new Logger(VentasService.name);

    constructor(
        @InjectRepository(BalancePedidoVentaEntity)
        private readonly balanceRepo: Repository<BalancePedidoVentaEntity>,
        @InjectRepository(MovimientoPedidoVentaEntity)
        private readonly movimientosRepo: Repository<MovimientoPedidoVentaEntity>,
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
        @InjectRepository(ArticuloEstructuraEntity)
        private readonly estructuraRepo: Repository<ArticuloEstructuraEntity>,
        private readonly dataSource: DataSource,
    ) { }

    /**
     * Lista los pedidos activos de venta con filtros y calcula KPIs de ventas
     */
    async listarPedidos(filtros: FiltrosPedidosDto) {
        const qb = this.balanceRepo.createQueryBuilder('p')
            .leftJoinAndSelect('p.articulo', 'art');

        if (filtros.cliente && filtros.cliente !== 'TODOS') {
            qb.andWhere('UPPER(p.cliente) = :cliente', { cliente: filtros.cliente.toUpperCase().trim() });
        }

        if (filtros.estado && filtros.estado !== 'TODOS') {
            qb.andWhere('p.estado = :estado', { estado: filtros.estado });
        }

        if (filtros.soloSinEstructura) {
            qb.andWhere('p.tieneEstructura = false');
        }

        if (filtros.soloPendientes) {
            qb.andWhere('p.saldoPendiente > 0 AND p.estado != :desp', { desp: EstadoPedidoVenta.DESPACHADO });
        }

        if (filtros.search && filtros.search.trim()) {
            const term = `%${filtros.search.trim().toLowerCase()}%`;
            qb.andWhere(
                '(LOWER(p.numeroPedido) LIKE :term OR LOWER(p.articuloCodigo) LIKE :term OR LOWER(p.cliente) LIKE :term OR LOWER(COALESCE(p.articuloDescripcion, \'\')) LIKE :term)',
                { term },
            );
        }

        qb.orderBy('p.fechaEntrega', 'ASC', 'NULLS LAST')
            .addOrderBy('p.actualizadoEn', 'DESC');

        const [pedidos, total] = await qb.getManyAndCount();

        // Calcular KPIs globales en memoria o agregación
        const kpiQuery = await this.balanceRepo.createQueryBuilder('p')
            .select('SUM(p.packsPedidas)', 'totalPedidas')
            .addSelect('SUM(p.packsDespachadas)', 'totalDespachadas')
            .addSelect('SUM(p.packsArmadas)', 'totalArmadas')
            .addSelect('SUM(CASE WHEN p.tieneEstructura = false THEN 1 ELSE 0 END)', 'sinEstructura')
            .getRawOne();

        const totalPedidas = Number(kpiQuery?.totalPedidas) || 0;
        const totalDespachadas = Number(kpiQuery?.totalDespachadas) || 0;
        const totalArmadas = Number(kpiQuery?.totalArmadas) || 0;
        const totalSinEstructura = Number(kpiQuery?.sinEstructura) || 0;
        const totalEnTransaccional = Math.max(0, totalPedidas - totalDespachadas - totalArmadas);

        return {
            pedidos,
            total,
            kpis: {
                totalPacksPedidas: Math.round(totalPedidas * 100) / 100,
                totalPacksDespachadas: Math.round(totalDespachadas * 100) / 100,
                totalPacksArmadas: Math.round(totalArmadas * 100) / 100,
                totalPacksEnTransaccional: Math.round(totalEnTransaccional * 100) / 100,
                articulosSinEstructuraCount: totalSinEstructura,
            },
        };
    }

    /**
     * Obtiene el detalle de un pedido por ID
     */
    async obtenerPedidoPorId(id: string) {
        const pedido = await this.balanceRepo.findOne({
            where: { id },
            relations: ['articulo'],
        });
        if (!pedido) throw new NotFoundException(`Pedido ${id} no encontrado`);
        return pedido;
    }

    /**
     * Crea un pedido manualmente y verifica si el artículo tiene estructura en Desarrollo
     */
    async crearPedido(dto: CrearPedidoDto) {
        const artCodigo = dto.articuloCodigo.trim().toUpperCase();

        // 1. Buscar si el artículo existe en el catálogo maestro
        let articulo = await this.articuloRepo.findOne({
            where: { codigo: artCodigo },
        });

        // Fallback: buscar sin case sensitive
        if (!articulo) {
            articulo = await this.articuloRepo.findOne({
                where: { codigo: ILike(artCodigo) },
            });
        }

        // 2. Verificar si tiene estructura cargada en articulo_estructuras
        let tieneEstructura = false;
        if (articulo) {
            const countBOM = await this.estructuraRepo.count({
                where: { codigoPadre: articulo.codigo },
            });
            tieneEstructura = countBOM > 0;
        }

        const estadoInicial = tieneEstructura
            ? EstadoPedidoVenta.CONFIRMADO
            : EstadoPedidoVenta.PENDIENTE_ESTRUCTURA;

        const nuevo = this.balanceRepo.create({
            numeroPedido: dto.numeroPedido.trim(),
            cliente: dto.cliente.trim().toUpperCase(),
            destino: (dto.destino || 'ARGENTINA').trim().toUpperCase(),
            fechaPedido: dto.fechaPedido || new Date().toISOString().slice(0, 10),
            fechaEntrega: dto.fechaEntrega || null,
            articuloId: articulo ? articulo.id : null,
            articuloCodigo: artCodigo,
            articuloDescripcion: dto.articuloDescripcion || articulo?.descripcion || artCodigo,
            talle: dto.talle || articulo?.talle || null,
            paresPorPack: Number(dto.paresPorPack) || 1,
            packsPedidas: Number(dto.packsPedidas) || 0,
            packsTejidas: 0,
            packsCocidas: 0,
            packsPlanchadas: 0,
            packsEmpaquetadas: 0,
            packsArmadas: 0,
            packsDespachadas: 0,
            porcentajeCompleto: 0,
            estado: estadoInicial,
            tieneEstructura,
            prioridad: dto.prioridad || 'NORMAL',
            observaciones: dto.observaciones || null,
        });

        const guardado = await this.balanceRepo.save(nuevo);

        // Registrar auditoría de alta
        await this.movimientosRepo.save(
            this.movimientosRepo.create({
                pedidoId: guardado.id,
                numeroPedido: guardado.numeroPedido,
                articuloId: guardado.articuloId,
                articuloCodigo: guardado.articuloCodigo,
                tipoMovimiento: TipoMovimientoPedidoVenta.ALTA_PEDIDO,
                cantidadPacks: guardado.packsPedidas,
                paresEquivalentes: guardado.packsPedidas * guardado.paresPorPack,
                estadioOrigen: null,
                estadioDestino: estadoInicial,
                documentoReferencia: guardado.numeroPedido,
                observaciones: `Alta de pedido ${guardado.numeroPedido} (${guardado.packsPedidas} packs). Estructura: ${tieneEstructura ? 'OK' : 'PENDIENTE'}`,
            }),
        );

        return guardado;
    }

    /**
     * Registra un avance de estadio en la producción del pedido (TEJIDO, COCIDO, PLANCHADO, EMPAQUETADO, ARMADO)
     */
    async registrarAvanceEstadio(pedidoId: string, dto: AvanceEstadioDto) {
        const pedido = await this.obtenerPedidoPorId(pedidoId);
        const cant = Number(dto.cantidadPacks) || 0;
        if (cant <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');

        let tipoMov = TipoMovimientoPedidoVenta.AVANCE_TEJIDO;
        let nuevoEstado = pedido.estado;

        switch (dto.estadio) {
            case 'TEJIDO':
                pedido.packsTejidas = Number(pedido.packsTejidas || 0) + cant;
                tipoMov = TipoMovimientoPedidoVenta.AVANCE_TEJIDO;
                nuevoEstado = EstadoPedidoVenta.EN_TEJIDO;
                break;
            case 'COCIDO':
                pedido.packsCocidas = Number(pedido.packsCocidas || 0) + cant;
                tipoMov = TipoMovimientoPedidoVenta.AVANCE_COSTURA;
                nuevoEstado = EstadoPedidoVenta.EN_COSTURA;
                break;
            case 'PLANCHADO':
                pedido.packsPlanchadas = Number(pedido.packsPlanchadas || 0) + cant;
                tipoMov = TipoMovimientoPedidoVenta.AVANCE_PLANCHA;
                nuevoEstado = EstadoPedidoVenta.EN_PLANCHA;
                break;
            case 'EMPAQUETADO':
                pedido.packsEmpaquetadas = Number(pedido.packsEmpaquetadas || 0) + cant;
                tipoMov = TipoMovimientoPedidoVenta.AVANCE_EMPAQUE;
                nuevoEstado = EstadoPedidoVenta.EMPAQUETADO;
                break;
            case 'ARMADO':
                pedido.packsArmadas = Number(pedido.packsArmadas || 0) + cant;
                tipoMov = TipoMovimientoPedidoVenta.ARMADO_DESPACHO;
                nuevoEstado = EstadoPedidoVenta.ARMADO_DESPACHO;
                break;
        }

        // Recalcular % de completitud ponderado
        const pedidas = Number(pedido.packsPedidas) || 1;
        const avancePonderado = (
            Number(pedido.packsTejidas) * 0.15 +
            Number(pedido.packsCocidas) * 0.20 +
            Number(pedido.packsPlanchadas) * 0.15 +
            Number(pedido.packsEmpaquetadas) * 0.25 +
            Number(pedido.packsArmadas) * 0.25
        ) / pedidas * 100;

        pedido.porcentajeCompleto = Math.min(100, Math.max(0, Math.round(avancePonderado * 10) / 10));
        pedido.estado = nuevoEstado;
        pedido.actualizadoEn = new Date();

        await this.balanceRepo.save(pedido);

        // Guardar movimiento inmutable en el historial
        await this.movimientosRepo.save(
            this.movimientosRepo.create({
                pedidoId: pedido.id,
                numeroPedido: pedido.numeroPedido,
                articuloId: pedido.articuloId,
                articuloCodigo: pedido.articuloCodigo,
                tipoMovimiento: tipoMov,
                cantidadPacks: cant,
                paresEquivalentes: cant * (pedido.paresPorPack || 1),
                estadioOrigen: pedido.estado,
                estadioDestino: dto.estadio,
                documentoReferencia: pedido.numeroPedido,
                usuarioId: dto.usuarioId || null,
                observaciones: dto.observaciones || `Avance de ${cant} packs en ${dto.estadio}`,
            }),
        );

        return pedido;
    }

    /**
     * Emite un remito de salida, descontando del saldo pendiente y registrando el evento
     */
    async emitirRemitoSalida(pedidoId: string, dto: EmitirRemitoDto) {
        const pedido = await this.obtenerPedidoPorId(pedidoId);
        const cant = Number(dto.cantidadPacks) || 0;
        if (cant <= 0) throw new BadRequestException('La cantidad a despachar debe ser mayor a 0');

        const remitoNum = dto.numeroRemito.trim().toUpperCase();
        if (!remitoNum) throw new BadRequestException('El número de remito es obligatorio');

        const prevDespachadas = Number(pedido.packsDespachadas) || 0;
        const nextDespachadas = prevDespachadas + cant;
        pedido.packsDespachadas = nextDespachadas;

        // Si se completó el despacho de todas las packs pedidas
        if (pedido.packsDespachadas >= Number(pedido.packsPedidas)) {
            pedido.estado = EstadoPedidoVenta.DESPACHADO;
            pedido.porcentajeCompleto = 100;
        }

        pedido.actualizadoEn = new Date();
        await this.balanceRepo.save(pedido);

        // 1. Guardar en movimientos_pedidos_ventas
        await this.movimientosRepo.save(
            this.movimientosRepo.create({
                pedidoId: pedido.id,
                numeroPedido: pedido.numeroPedido,
                articuloId: pedido.articuloId,
                articuloCodigo: pedido.articuloCodigo,
                tipoMovimiento: TipoMovimientoPedidoVenta.REMITO_SALIDA,
                cantidadPacks: cant,
                paresEquivalentes: cant * (pedido.paresPorPack || 1),
                estadioOrigen: EstadoPedidoVenta.ARMADO_DESPACHO,
                estadioDestino: EstadoPedidoVenta.DESPACHADO,
                documentoReferencia: remitoNum,
                numeroRemito: remitoNum,
                usuarioId: dto.usuarioId || null,
                observaciones: dto.observaciones || `Despacho de ${cant} packs por Remito ${remitoNum} para cliente ${pedido.cliente}`,
            }),
        );

        // 2. Si el artículo está registrado en el catálogo maestro, registrar la salida física en movimientos_articulos
        if (pedido.articuloId) {
            try {
                const movFisico = this.dataSource.getRepository(MovimientoArticuloEntity).create({
                    articuloId: pedido.articuloId,
                    tipo: TipoMovimientoArticulo.SALIDA,
                    deposito: 'TERMINADO',
                    cantidad: cant * (pedido.paresPorPack || 1),
                    documentoReferencia: `REMITO-${remitoNum}`,
                    observaciones: `Salida despacho P.O. ${pedido.numeroPedido} (${cant} packs)`,
                    fecha: new Date().toISOString().slice(0, 10),
                    userId: dto.usuarioId || 'VENTAS',
                });
                await this.dataSource.getRepository(MovimientoArticuloEntity).save(movFisico);
            } catch (err: any) {
                this.logger.warn(`Aviso: No se pudo descontar stock físico en TERMINADO: ${err.message}`);
            }
        }

        return pedido;
    }

    /**
     * Importa y sincroniza los pedidos desde un Buffer subido o desde archivo Excel en disco
     */
    async importarDesdeConsolidado(fileBuffer?: Buffer, customFilePath?: string) {
        let wb: xlsx.WorkBook;

        if (fileBuffer) {
            wb = xlsx.read(fileBuffer, { type: 'buffer', cellFormula: false });
        } else {
            const defaultPath = 'c:\\Users\\Admin\\Desktop\\TODO\\Consolidado Pedidos DW (2).xlsx';
            const targetPath = customFilePath || defaultPath;

            if (!fs.existsSync(targetPath)) {
                throw new NotFoundException(`No se encontró el archivo de pedidos en: ${targetPath}`);
            }
            wb = xlsx.readFile(targetPath, { cellFormula: false });
        }
        const sheetName = wb.SheetNames.includes('Consolidado') ? 'Consolidado' : wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows: any[] = xlsx.utils.sheet_to_json(sheet);

        let importados = 0;
        let actualizados = 0;
        let sinEstructura = 0;

        // Cachear artículos maestros y estructuras para no saturar DB
        const allArticulos = await this.articuloRepo.find({
            select: ['id', 'codigo', 'descripcion', 'talle', 'marca', 'modelo', 'destino'],
        });
        const artByCode = new Map<string, ArticuloEntity>();
        for (const a of allArticulos) {
            artByCode.set(a.codigo.toUpperCase().trim(), a);
        }

        const structures = await this.estructuraRepo.find({
            select: ['codigoPadre'],
        });
        const bomSet = new Set<string>();
        for (const s of structures) {
            bomSet.add(s.codigoPadre.toUpperCase().trim());
        }

        for (const row of rows) {
            const po = String(row['P.O.'] || row['PO'] || '').trim();
            const cliente = String(row['MARCAS'] || row['Marca'] || row['Cliente'] || 'ADIDAS').trim().toUpperCase();
            const artRaw = String(row['Articulo'] || row['Articulo Number'] || '').trim();
            const desc = String(row['Descripción'] || row['Descripcion'] || '').trim();
            const talle = String(row['T'] || row['Talle'] || '').trim().toUpperCase();
            let u = Number(row['U'] || row['Pack'] || 1) || 1;
            if (isNaN(u) || u <= 0) {
                const descUpper = desc.toUpperCase();
                if (descUpper.includes('3PK') || descUpper.includes('3 PK') || descUpper.includes('3-PK') || descUpper.includes('X3')) u = 3;
                else if (descUpper.includes('6PK') || descUpper.includes('6 PK') || descUpper.includes('6-PK') || descUpper.includes('X6')) u = 6;
                else if (descUpper.includes('2PK') || descUpper.includes('2 PK') || descUpper.includes('X2')) u = 2;
                else u = 1;
            }
            const cantPacks = Number(row['Cantidad'] || row['Packs'] || 0) || 0;
            const destino = String(row['DESTINO'] || 'ARGENTINA').trim().toUpperCase();
            const remito = String(row['Remito'] || '').trim();
            const fechaEntregaRaw = row['Fecha de entrega'] || row['CRD / OGAC'] || null;

            if (!artRaw || cantPacks <= 0) continue;

            // Matching inteligente con el código de producto terminado
            let artMatched: ArticuloEntity | undefined = artByCode.get(artRaw.toUpperCase());

            if (!artMatched) {
                // Probar combinaciones habituales: <Articulo>_<Talle>_<DestinoCorto>
                const destShort = destino === 'ARGENTINA' ? 'AR' : destino.slice(0, 2);
                const candidates = [
                    `${artRaw}_${talle}_${destShort}`.toUpperCase(),
                    `${artRaw}_${talle}`.toUpperCase(),
                    `${artRaw}_${destShort}`.toUpperCase(),
                ];
                for (const c of candidates) {
                    if (artByCode.has(c)) {
                        artMatched = artByCode.get(c);
                        break;
                    }
                }
            }

            const targetCode = artMatched ? artMatched.codigo : (talle ? `${artRaw}_${talle}` : artRaw);
            const hasBOM = bomSet.has(targetCode.toUpperCase()) || (artMatched ? bomSet.has(artMatched.codigo.toUpperCase()) : false);

            if (!hasBOM) sinEstructura++;

            const numPedido = po && po !== '0000' && po !== '0' ? po : `ORD-${cliente.slice(0, 3)}-${targetCode}`;

            // Buscar si ya existe el pedido activo
            let existing = await this.balanceRepo.findOne({
                where: { numeroPedido: numPedido, articuloCodigo: targetCode },
            });

            let fechaEntrega: string | null = null;
            if (fechaEntregaRaw) {
                if (typeof fechaEntregaRaw === 'number') {
                    const d = new Date(Math.round((fechaEntregaRaw - 25569) * 86400 * 1000));
                    fechaEntrega = d.toISOString().slice(0, 10);
                } else {
                    fechaEntrega = String(fechaEntregaRaw).slice(0, 10);
                }
            }

            if (existing) {
                existing.packsPedidas = cantPacks;
                existing.paresPorPack = u;
                existing.tieneEstructura = hasBOM;
                if (!hasBOM && existing.estado !== EstadoPedidoVenta.DESPACHADO) {
                    existing.estado = EstadoPedidoVenta.PENDIENTE_ESTRUCTURA;
                }
                if (remito && !existing.packsDespachadas) {
                    existing.packsDespachadas = cantPacks;
                    existing.estado = EstadoPedidoVenta.DESPACHADO;
                }
                existing.actualizadoEn = new Date();
                await this.balanceRepo.save(existing);
                actualizados++;
            } else {
                const isDespachado = !!remito;
                const nuevo = this.balanceRepo.create({
                    numeroPedido: numPedido,
                    cliente,
                    destino,
                    fechaPedido: new Date().toISOString().slice(0, 10),
                    fechaEntrega,
                    articuloId: artMatched ? artMatched.id : null,
                    articuloCodigo: targetCode,
                    articuloDescripcion: desc || artMatched?.descripcion || targetCode,
                    talle: talle || artMatched?.talle || null,
                    paresPorPack: u,
                    packsPedidas: cantPacks,
                    packsTejidas: isDespachado ? cantPacks : 0,
                    packsCocidas: isDespachado ? cantPacks : 0,
                    packsPlanchadas: isDespachado ? cantPacks : 0,
                    packsEmpaquetadas: isDespachado ? cantPacks : 0,
                    packsArmadas: isDespachado ? cantPacks : 0,
                    packsDespachadas: isDespachado ? cantPacks : 0,
                    porcentajeCompleto: isDespachado ? 100 : 0,
                    estado: isDespachado
                        ? EstadoPedidoVenta.DESPACHADO
                        : hasBOM
                            ? EstadoPedidoVenta.CONFIRMADO
                            : EstadoPedidoVenta.PENDIENTE_ESTRUCTURA,
                    tieneEstructura: hasBOM,
                    prioridad: 'NORMAL',
                    observaciones: remito ? `Remito inicial: ${remito}` : null,
                });

                const saved = await this.balanceRepo.save(nuevo);

                await this.movimientosRepo.save(
                    this.movimientosRepo.create({
                        pedidoId: saved.id,
                        numeroPedido: saved.numeroPedido,
                        articuloId: saved.articuloId,
                        articuloCodigo: saved.articuloCodigo,
                        tipoMovimiento: TipoMovimientoPedidoVenta.ALTA_PEDIDO,
                        cantidadPacks: saved.packsPedidas,
                        paresEquivalentes: saved.packsPedidas * saved.paresPorPack,
                        documentoReferencia: remito || saved.numeroPedido,
                        numeroRemito: remito || null,
                        observaciones: `Importado desde Excel Consolidado Pedidos`,
                    }),
                );

                importados++;
            }
        }

        return {
            mensaje: `Importación finalizada con éxito`,
            importados,
            actualizados,
            articulosSinEstructura: sinEstructura,
        };
    }

    /**
     * Lista artículos que están en pedidos pero no tienen estructura en Desarrollo
     */
    async listarArticulosSinEstructura() {
        return this.balanceRepo.find({
            where: { tieneEstructura: false },
            order: { fechaPedido: 'DESC' },
        });
    }

    /**
     * Lista el historial de movimientos de pedidos para auditoría
     */
    async listarMovimientos(filtros: { pedidoId?: string; search?: string; page?: number; limit?: number }) {
        const qb = this.movimientosRepo.createQueryBuilder('m')
            .leftJoinAndSelect('m.articulo', 'art');

        if (filtros.pedidoId) {
            qb.andWhere('m.pedidoId = :pId', { pId: filtros.pedidoId });
        }

        if (filtros.search && filtros.search.trim()) {
            const term = `%${filtros.search.trim().toLowerCase()}%`;
            qb.andWhere(
                '(LOWER(m.numeroPedido) LIKE :term OR LOWER(m.articuloCodigo) LIKE :term OR LOWER(COALESCE(m.numeroRemito, \'\')) LIKE :term)',
                { term },
            );
        }

        qb.orderBy('m.fecha', 'DESC');

        const [movimientos, total] = await qb.getManyAndCount();
        return { movimientos, total };
    }
}
