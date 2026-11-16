import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import {
    MovimientoArticuloEntity,
    TipoMovimientoArticulo,
    MovimientoArticuloStatus,
} from '../../infrastructure/persistence/entities/movimiento-articulo.entity';
import { ArticuloEntity } from '../../infrastructure/persistence/entities/articulo.entity';
import { BalanceStockArticuloEntity } from '../../infrastructure/persistence/entities/balance-stock-articulo.entity';

export interface RegistrarMovimientoArticuloDto {
    articuloId: string;
    tipo: TipoMovimientoArticulo;
    cantidad: number;
    deposito?: string;
    lote?: string | null;
    documentoReferencia?: string | null;
    observaciones?: string | null;
    fecha?: string;
    userId?: string | null;
}

export interface MovimientosArticulosFilterDto {
    articuloId?: string;
    codigoArticulo?: string;
    tipo?: TipoMovimientoArticulo;
    deposito?: string;
    desde?: string;
    hasta?: string;
    documentoReferencia?: string;
    status?: MovimientoArticuloStatus;
    page?: number;
    limit?: number;
}

@Injectable()
export class MovimientosArticulosService {
    constructor(
        @InjectRepository(MovimientoArticuloEntity)
        private readonly movimientoRepo: Repository<MovimientoArticuloEntity>,
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
        @InjectRepository(BalanceStockArticuloEntity)
        private readonly balanceRepo: Repository<BalanceStockArticuloEntity>,
        private readonly dataSource: DataSource,
    ) { }

    private reducesStock(tipo: TipoMovimientoArticulo): boolean {
        return [
            TipoMovimientoArticulo.SALIDA,
            TipoMovimientoArticulo.AJUSTE_RESTA,
            TipoMovimientoArticulo.SACADA_SEGUNDA,
            TipoMovimientoArticulo.RECHAZO,
            TipoMovimientoArticulo.ANULACION_ENTRADA,
            TipoMovimientoArticulo.ANULACION_AJUSTE_SUMA,
        ].includes(tipo);
    }

    private getTipoAnulacion(tipoOriginal: TipoMovimientoArticulo): TipoMovimientoArticulo {
        switch (tipoOriginal) {
            case TipoMovimientoArticulo.ENTRADA:
                return TipoMovimientoArticulo.ANULACION_ENTRADA;
            case TipoMovimientoArticulo.SALIDA:
                return TipoMovimientoArticulo.ANULACION_SALIDA;
            case TipoMovimientoArticulo.AJUSTE_SUMA:
                return TipoMovimientoArticulo.ANULACION_AJUSTE_SUMA;
            case TipoMovimientoArticulo.AJUSTE_RESTA:
                return TipoMovimientoArticulo.ANULACION_AJUSTE_RESTA;
            case TipoMovimientoArticulo.SACADA_SEGUNDA:
                return TipoMovimientoArticulo.ANULACION_SACADA_SEGUNDA;
            case TipoMovimientoArticulo.RECHAZO:
                return TipoMovimientoArticulo.ANULACION_RECHAZO;
            default:
                throw new BadRequestException(`No se puede anular un movimiento de tipo ${tipoOriginal}`);
        }
    }

    async registrar(
        dto: RegistrarMovimientoArticuloDto,
        manager?: EntityManager,
    ): Promise<MovimientoArticuloEntity> {
        if (!manager) {
            return this.dataSource.transaction((tx) => this.registrar(dto, tx));
        }

        if (!dto.articuloId) {
            throw new BadRequestException('El movimiento requiere el identificador del artículo.');
        }

        const cantidad = Number(dto.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
            throw new BadRequestException('La cantidad debe ser un número positivo mayor a cero.');
        }

        const articulo = await manager.findOne(ArticuloEntity, {
            where: { id: dto.articuloId },
        });
        if (!articulo) {
            throw new NotFoundException(`El artículo indicado no existe.`);
        }
        if (!articulo.activo) {
            throw new BadRequestException(`El artículo ${articulo.codigo} está inactivo.`);
        }

        const deposito = (dto.deposito || articulo.etapa || 'TERMINADO').trim().toUpperCase();

        // Lock consultivo por artículo y depósito
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            `stock_articulo:${deposito}`,
            dto.articuloId,
        ]);

        if (this.reducesStock(dto.tipo)) {
            const balance = await manager.findOne(BalanceStockArticuloEntity, {
                where: {
                    articuloId: dto.articuloId,
                    deposito,
                },
                lock: { mode: 'pessimistic_write' },
            });

            const stockDisponible = Number(balance?.stockActual ?? 0);
            if (stockDisponible < cantidad) {
                throw new BadRequestException(
                    `Stock insuficiente para "${articulo.codigo} - ${articulo.descripcion}" en depósito ${deposito}. Disponible: ${stockDisponible.toFixed(3)}, Requerido: ${cantidad.toFixed(3)}.`,
                );
            }
        }

        const repo = manager.getRepository(MovimientoArticuloEntity);
        const fecha = dto.fecha || new Date().toISOString().split('T')[0];

        const mov = repo.create({
            tipo: dto.tipo,
            articuloId: dto.articuloId,
            deposito,
            cantidad,
            lote: dto.lote?.trim() || null,
            documentoReferencia: dto.documentoReferencia?.trim() || null,
            observaciones: dto.observaciones?.trim() || null,
            fecha,
            userId: dto.userId || null,
            status: MovimientoArticuloStatus.ACTIVO,
        });

        return repo.save(mov);
    }

    async findAll(filters: MovimientosArticulosFilterDto): Promise<{
        items: MovimientoArticuloEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
        const skip = (page - 1) * limit;

        const qb = this.movimientoRepo
            .createQueryBuilder('m')
            .leftJoinAndSelect('m.articulo', 'a')
            .orderBy('m.fecha', 'DESC')
            .addOrderBy('m.createdAt', 'DESC');

        if (filters.articuloId) {
            qb.andWhere('m.articuloId = :articuloId', { articuloId: filters.articuloId });
        }

        if (filters.codigoArticulo) {
            qb.andWhere('a.codigo ILIKE :codigo', {
                codigo: `%${filters.codigoArticulo.trim()}%`,
            });
        }

        if (filters.tipo) {
            qb.andWhere('m.tipo = :tipo', { tipo: filters.tipo });
        }

        if (filters.deposito) {
            qb.andWhere('m.deposito = :deposito', {
                deposito: filters.deposito.trim().toUpperCase(),
            });
        }

        if (filters.desde) {
            qb.andWhere('m.fecha >= :desde', { desde: filters.desde });
        }

        if (filters.hasta) {
            qb.andWhere('m.fecha <= :hasta', { hasta: filters.hasta });
        }

        if (filters.documentoReferencia) {
            qb.andWhere('m.documentoReferencia ILIKE :doc', {
                doc: `%${filters.documentoReferencia.trim()}%`,
            });
        }

        if (filters.status) {
            qb.andWhere('m.status = :status', { status: filters.status });
        }

        qb.skip(skip).take(limit);

        const [items, total] = await qb.getManyAndCount();

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findOne(id: string): Promise<MovimientoArticuloEntity> {
        const mov = await this.movimientoRepo.findOne({
            where: { id },
            relations: ['articulo'],
        });
        if (!mov) {
            throw new NotFoundException(`Movimiento con ID ${id} no encontrado.`);
        }
        return mov;
    }

    async anular(
        id: string,
        userId?: string | null,
        motivo?: string | null,
        manager?: EntityManager,
    ): Promise<MovimientoArticuloEntity> {
        if (!manager) {
            return this.dataSource.transaction((tx) => this.anular(id, userId, motivo, tx));
        }

        const repo = manager.getRepository(MovimientoArticuloEntity);
        const original = await repo.findOne({
            where: { id },
            lock: { mode: 'pessimistic_write' },
        });

        if (!original) {
            throw new NotFoundException(`Movimiento ${id} no encontrado.`);
        }
        if (original.status === MovimientoArticuloStatus.ANULADO) {
            throw new BadRequestException('El movimiento ya se encuentra anulado.');
        }

        const tipoCompensacion = this.getTipoAnulacion(original.tipo);

        // Marcar como anulado
        original.status = MovimientoArticuloStatus.ANULADO;
        await repo.save(original);

        // Crear contra-movimiento compensatorio
        return this.registrar(
            {
                tipo: tipoCompensacion,
                articuloId: original.articuloId,
                deposito: original.deposito,
                cantidad: original.cantidad,
                lote: original.lote,
                documentoReferencia: original.documentoReferencia,
                observaciones: `Anulación del movimiento ${original.id}. ${motivo || original.observaciones || ''}`,
                fecha: new Date().toISOString().split('T')[0],
                userId: userId || original.userId,
            },
            manager,
        );
    }
}
