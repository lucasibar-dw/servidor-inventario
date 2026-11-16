import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceStockArticuloEntity } from '../../infrastructure/persistence/entities/balance-stock-articulo.entity';
import { ArticuloEntity } from '../../infrastructure/persistence/entities/articulo.entity';

export interface StockArticulosFilterDto {
    deposito?: string;
    search?: string;
    tipo?: string;
    marca?: string;
    talle?: string;
    soloConStock?: boolean;
    page?: number;
    limit?: number;
}

@Injectable()
export class BalanceStockArticulosService {
    constructor(
        @InjectRepository(BalanceStockArticuloEntity)
        private readonly balanceRepo: Repository<BalanceStockArticuloEntity>,
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
    ) { }

    async findAll(filters: StockArticulosFilterDto): Promise<{
        items: BalanceStockArticuloEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
        const skip = (page - 1) * limit;

        const qb = this.balanceRepo
            .createQueryBuilder('b')
            .leftJoinAndSelect('b.articulo', 'a')
            .orderBy('a.codigo', 'ASC')
            .addOrderBy('b.deposito', 'ASC');

        if (filters.deposito) {
            qb.andWhere('b.deposito = :deposito', {
                deposito: filters.deposito.trim().toUpperCase(),
            });
        }

        if (filters.search) {
            const term = `%${filters.search.trim()}%`;
            qb.andWhere('(a.codigo ILIKE :term OR a.descripcion ILIKE :term OR a.articuloGenerico ILIKE :term)', {
                term,
            });
        }

        if (filters.tipo) {
            qb.andWhere('a.tipo = :tipo', { tipo: filters.tipo.trim().toUpperCase() });
        }

        if (filters.marca) {
            qb.andWhere('a.marca ILIKE :marca', { marca: `%${filters.marca.trim()}%` });
        }

        if (filters.talle) {
            qb.andWhere('a.talle = :talle', { talle: filters.talle.trim() });
        }

        if (filters.soloConStock) {
            qb.andWhere('b.stockActual > 0');
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

    async findByArticulo(articuloId: string): Promise<BalanceStockArticuloEntity[]> {
        return this.balanceRepo.find({
            where: { articuloId },
            relations: ['articulo'],
            order: { deposito: 'ASC' },
        });
    }

    async getResumenKpis(): Promise<{
        totalArticulosConStock: number;
        totalUnidadesStock: number;
        totalUnidadesSegunda: number;
        totalUnidadesRechazos: number;
    }> {
        const res = await this.balanceRepo
            .createQueryBuilder('b')
            .select('COUNT(DISTINCT b.articuloId)', 'articulosConStock')
            .addSelect('COALESCE(SUM(b.stockActual), 0)', 'totalStock')
            .addSelect('COALESCE(SUM(b.totalSegunda), 0)', 'totalSegunda')
            .addSelect('COALESCE(SUM(b.totalRechazos), 0)', 'totalRechazos')
            .where('b.stockActual > 0 OR b.totalSegunda > 0 OR b.totalRechazos > 0')
            .getRawOne();

        return {
            totalArticulosConStock: Number(res?.articulosConStock || 0),
            totalUnidadesStock: Number(res?.totalStock || 0),
            totalUnidadesSegunda: Number(res?.totalSegunda || 0),
            totalUnidadesRechazos: Number(res?.totalRechazos || 0),
        };
    }
}
