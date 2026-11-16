import { Injectable, OnModuleInit, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCategoryEntity } from '../../infrastructure/persistence/entities/item-category.entity';

@Injectable()
export class CategoriesService implements OnModuleInit {
    private readonly logger = new Logger(CategoriesService.name);

    constructor(
        @InjectRepository(ItemCategoryEntity)
        private readonly repository: Repository<ItemCategoryEntity>,
    ) { }

    async onModuleInit() {
        try {
            await this.seedHiladoCategories();
        } catch (error) {
            this.logger.error(`Failed to seed categories: ${error.message}`);
        }
    }

    private async seedHiladoCategories() {
        const hiladoDepotId = '2f27f418-8f81-41e4-9500-b18a62674ed2';
        const categories = [
            'ALGODON', 'NYLON', 'GOMA', 'LYCRA', 
            'POLIESTER', 'ALGODON-BLANCO', 'ALGODON-NEGRO'
        ];

        for (const name of categories) {
            const exists = await this.repository.findOne({
                where: { nombre: name, depositoId: hiladoDepotId }
            });
            if (!exists) {
                this.logger.log(`Seeding category ${name} for Hilado depot`);
                await this.repository.save({
                    nombre: name,
                    depositoId: hiladoDepotId,
                    activo: true
                });
            }
        }
    }

    async findAll(user: any, depositoId?: string) {
        try {
            const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
            const allowedDepots = user?.allowedDepotIds || [];

            const query = this.repository.createQueryBuilder('category')
                .where('category.activo = :activo', { activo: true });

            if (!isAdmin && allowedDepots.length > 0) {
                if (depositoId && depositoId !== 'undefined' && depositoId !== 'null') {
                    if (allowedDepots.includes(depositoId)) {
                        query.andWhere('category.depositoId = :depositoId', { depositoId });
                    } else {
                        query.andWhere('category.depositoId = :depositoId', { depositoId: '00000000-0000-0000-0000-000000000000' });
                    }
                } else {
                    query.andWhere('category.depositoId IN (:...allowedDepots)', { allowedDepots });
                }
            } else if (depositoId && depositoId !== 'undefined' && depositoId !== 'null') {
                query.andWhere('category.depositoId = :depositoId', { depositoId });
            }

            return await query.orderBy('category.nombre', 'ASC').getMany();
        } catch (error) {
            this.logger.error(`Error fetching categories for user ${user?.id || 'unknown'}: ${error.message}`, error.stack);
            throw error; // Rethrow to let NestJS handle it and potentially see the 500 details if it persists
        }
    }

    async create(dto: { nombre: string; depositoId: string; minimo?: number; maximo?: number }) {
        if (!dto.nombre || !dto.depositoId) {
            throw new BadRequestException('El nombre y el depósito son obligatorios');
        }
        
        const nombre = dto.nombre.toUpperCase().trim();
        const existing = await this.repository.findOne({
            where: { nombre, depositoId: dto.depositoId }
        });
        if (existing) {
            existing.minimo = dto.minimo !== undefined ? dto.minimo : existing.minimo;
            existing.maximo = dto.maximo !== undefined ? dto.maximo : existing.maximo;
            existing.activo = true;
            return this.repository.save(existing);
        }

        return this.repository.save({
            nombre,
            depositoId: dto.depositoId,
            minimo: dto.minimo ?? null,
            maximo: dto.maximo ?? null,
            activo: true
        });
    }

    async update(id: string, dto: Partial<{ nombre: string; minimo: number; maximo: number; activo: boolean }>) {
        const category = await this.repository.findOneBy({ id });
        if (!category) throw new NotFoundException(`Categoría ${id} no encontrada`);

        if (dto.nombre !== undefined) category.nombre = dto.nombre.toUpperCase().trim();
        if (dto.minimo !== undefined) category.minimo = dto.minimo;
        if (dto.maximo !== undefined) category.maximo = dto.maximo;
        if (dto.activo !== undefined) category.activo = dto.activo;

        return this.repository.save(category);
    }

    async remove(id: string) {
        return this.repository.update(id, { activo: false });
    }
}
