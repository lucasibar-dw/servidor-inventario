import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './audit-log.entity';

export interface AuditSearch {
    page?: number;
    pageSize?: number;
    actor?: string;
    resource?: string;
    action?: string;
    success?: boolean;
    from?: string;
    to?: string;
}

@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(AuditLogEntity)
        private readonly repository: Repository<AuditLogEntity>,
    ) {}

    async record(data: Partial<AuditLogEntity>): Promise<void> {
        try {
            await this.repository.save(this.repository.create(data));
        } catch (error) {
            // Una falla de auditoría nunca debe interrumpir una operación productiva.
            console.error('No se pudo guardar el registro de auditoría:', error);
        }
    }

    async findAll(filters: AuditSearch) {
        const page = Math.max(1, Number(filters.page) || 1);
        const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize) || 25));
        const query = this.repository.createQueryBuilder('audit')
            .orderBy('audit.createdAt', 'DESC')
            .addOrderBy('audit.id', 'DESC');

        if (filters.actor?.trim()) {
            query.andWhere('(audit.actorUsername ILIKE :actor OR CAST(audit.actorId AS text) ILIKE :actor)', {
                actor: `%${filters.actor.trim()}%`,
            });
        }
        if (filters.resource?.trim()) {
            query.andWhere('audit.resource ILIKE :resource', { resource: `%${filters.resource.trim()}%` });
        }
        if (filters.action?.trim()) {
            query.andWhere('audit.action = :action', { action: filters.action.trim().toUpperCase() });
        }
        if (filters.success !== undefined) query.andWhere('audit.success = :success', { success: filters.success });
        if (filters.from) query.andWhere('audit.createdAt >= :from', { from: `${filters.from}T00:00:00.000Z` });
        if (filters.to) query.andWhere('audit.createdAt <= :to', { to: `${filters.to}T23:59:59.999Z` });

        const [data, total] = await query
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
    }
}
