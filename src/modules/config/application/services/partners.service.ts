import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { PartnerEntity, PartnerType } from '../../infrastructure/persistence/entities/partner.entity';

@Injectable()
export class PartnersService {
    constructor(
        @InjectRepository(PartnerEntity)
        private readonly repo: Repository<PartnerEntity>,
    ) { }

    async findAll(type?: string, q?: string): Promise<PartnerEntity[]> {
        const queryBuilder = this.repo.createQueryBuilder('p')
            .where('p.isActive = :isActive', { isActive: true });

        if (type) {
            // If CLIENT or SUPPLIER is requested, we also include BOTH
            queryBuilder.andWhere('(p.type = :type OR p.type = :both)', { type, both: PartnerType.BOTH });
        }

        if (q) {
            queryBuilder.andWhere('(p.name ILIKE :q OR p.taxId ILIKE :q)', { q: `%${q}%` });
        }

        return queryBuilder.getMany();
    }

    async findOne(id: string): Promise<PartnerEntity> {
        const p = await this.repo.findOneBy({ id });
        if (!p) throw new NotFoundException(`Partner ${id} no encontrado`);
        return p;
    }

    async create(dto: {
        name: string;
        type?: PartnerType;
        taxId?: string;
        email?: string;
        phone?: string;
        address?: string;
    }): Promise<PartnerEntity> {
        const p = this.repo.create({
            name: dto.name,
            type: dto.type ?? PartnerType.BOTH,
            taxId: dto.taxId ?? null,
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            address: dto.address ?? null,
            isActive: true,
        });
        return this.repo.save(p);
    }

    async update(id: string, dto: Partial<{
        name: string;
        type: PartnerType;
        taxId: string;
        email: string;
        phone: string;
        address: string;
        isActive: boolean;
    }>): Promise<PartnerEntity> {
        const p = await this.findOne(id);
        Object.assign(p, dto);
        return this.repo.save(p);
    }

    async remove(id: string): Promise<void> {
        const p = await this.findOne(id);
        p.isActive = false;
        await this.repo.save(p);
    }

    async upsertByName(dto: { name: string; type?: PartnerType; taxId?: string; email?: string }): Promise<PartnerEntity> {
        const existing = await this.repo.findOneBy({ name: dto.name, isActive: true });
        if (existing) return existing;
        return this.create(dto);
    }
}
