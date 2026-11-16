import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ItemEntity, RotacionType, TonoType } from '../../infrastructure/persistence/entities/item.entity';
import { PartnersService } from './partners.service';
import { PartnerType } from '../../infrastructure/persistence/entities/partner.entity';
import { BatchEntity } from '../../../warehouse/infrastructure/persistence/entities/batch.entity';
import { StockBalanceEntity } from '../../../warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { DocumentoEntity, TipoDocumento } from '../../../warehouse/infrastructure/persistence/entities/documento.entity';
import { MovimientoEntity } from '../../../warehouse/infrastructure/persistence/entities/movimiento.entity';

@Injectable()
export class ItemsService {
    constructor(
        @InjectRepository(ItemEntity)
        private readonly repo: Repository<ItemEntity>,
        private readonly partnersService: PartnersService,
        private readonly dataSource: DataSource,
    ) { }

    private validateItemData(dto: Record<string, any>, partial = false): void {
        if (!partial || dto.codigoInterno !== undefined) {
            if (!String(dto.codigoInterno ?? '').trim()) throw new BadRequestException('El código interno es obligatorio.');
        }
        if (!partial || dto.descripcion !== undefined) {
            if (!String(dto.descripcion ?? '').trim()) throw new BadRequestException('La descripción es obligatoria.');
        }
        if (!partial || dto.unidadPrincipal !== undefined) {
            if (!String(dto.unidadPrincipal ?? '').trim()) throw new BadRequestException('La unidad principal es obligatoria.');
        }
        for (const field of ['stockMinimo', 'stockMaximo', 'kilosPorCaja', 'pesoConoKg', 'leadTime']) {
            if (dto[field] !== undefined && dto[field] !== null && dto[field] !== '') {
                const value = Number(dto[field]);
                if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`${field} debe ser un número mayor o igual a cero.`);
            }
        }
        if (dto.stockMinimo !== undefined && dto.stockMaximo !== undefined
            && dto.stockMinimo !== null && dto.stockMaximo !== null
            && Number(dto.stockMinimo) > Number(dto.stockMaximo)) {
            throw new BadRequestException('El stock mínimo no puede ser mayor al stock máximo.');
        }
    }

    async findAll(user?: any, q?: string, categoryId?: string, boxTypeId?: string, depositoId?: string): Promise<ItemEntity[]> {
        const query = this.repo.createQueryBuilder('item')
            .leftJoinAndSelect('item.supplier', 'supplier')
            .leftJoinAndSelect('item.category', 'category')
            .leftJoinAndSelect('category.depot', 'depot')
            .leftJoinAndSelect('item.boxType', 'boxType')
            .where('item.activo = :activo', { activo: true });

        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowedDepots = user?.allowedDepotIds || [];

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

        if (categoryId) {
            query.andWhere('item.categoryId = :categoryId', { categoryId });
        }

        if (boxTypeId) {
            query.andWhere('item.boxTypeId = :boxTypeId', { boxTypeId });
        }

        if (q) {
            const terms = q.split(' ').filter(t => t.length > 0);
            terms.forEach((term, index) => {
                const t = `%${term}%`;
                query.andWhere(
                    ` (item.descripcion ILIKE :term${index} OR item.codigoInterno ILIKE :term${index} OR supplier.name ILIKE :term${index})`,
                    { [`term${index}`]: t }
                );
            });
        }

        const items = await query.getMany();
        return items.map(it => ({
            ...it,
            categoria: it.category?.nombre || null,
            depot: it.category?.depot || null
        })) as any;
    }

    async findOne(id: string): Promise<ItemEntity> {
        const item = await this.repo.findOne({ 
            where: { id },
            relations: ['supplier', 'category', 'category.depot', 'boxType']
        });
        if (!item) throw new NotFoundException(`Item ${id} no encontrado`);
        return {
            ...item,
            categoria: item.category?.nombre || null,
            depot: item.category?.depot || null
        } as any;
    }

    async create(dto: {
        codigoInterno: string;
        descripcion: string;
        categoryId?: string | null;
        rotacion?: RotacionType;
        stockMinimo?: number;
        stockMaximo?: number;
        kilosPorCaja?: number;
        pesoConoKg?: number;
        unidadPrincipal: string;
        unidadSecundaria?: string;
        tono?: TonoType | null;
        supplierId?: string | null;
        boxTypeId?: string | null;
        leadTime?: number;
    }): Promise<ItemEntity> {
        this.validateItemData(dto);
        const codigoTrimmed = (dto.codigoInterno || '').trim();
        if (!codigoTrimmed) {
            throw new BadRequestException('Falta llenar el código interno');
        }

        const existing = await this.repo.findOne({ where: { codigoInterno: codigoTrimmed } });
        if (existing) {
            if (!existing.activo) {
                Object.assign(existing, {
                    descripcion: dto.descripcion,
                    categoryId: dto.categoryId || null,
                    rotacion: dto.rotacion ?? RotacionType.MEDIA,
                    stockMinimo: dto.stockMinimo ?? null,
                    stockMaximo: dto.stockMaximo ?? null,
                    kilosPorCaja: dto.kilosPorCaja ?? null,
                    pesoConoKg: dto.pesoConoKg ?? null,
                    unidadPrincipal: dto.unidadPrincipal,
                    unidadSecundaria: dto.unidadSecundaria || null,
                    tono: dto.tono || null,
                    supplierId: dto.supplierId || null,
                    boxTypeId: dto.boxTypeId || null,
                    leadTime: dto.leadTime ?? 7,
                    activo: true,
                });
                return this.repo.save(existing);
            }
            throw new ConflictException(`El código interno '${codigoTrimmed}' ya está registrado`);
        }

        const item = this.repo.create({
            id: uuidv4(),
            codigoInterno: codigoTrimmed,
            descripcion: dto.descripcion,
            categoryId: dto.categoryId || null,
            rotacion: dto.rotacion ?? RotacionType.MEDIA,
            stockMinimo: dto.stockMinimo ?? null,
            stockMaximo: dto.stockMaximo ?? null,
            kilosPorCaja: dto.kilosPorCaja ?? null,
            pesoConoKg: dto.pesoConoKg ?? null,
            unidadPrincipal: dto.unidadPrincipal,
            unidadSecundaria: dto.unidadSecundaria || null,
            tono: dto.tono || null,
            supplierId: dto.supplierId || null,
            boxTypeId: dto.boxTypeId || null,
            leadTime: dto.leadTime ?? 7,
            activo: true,
            meta: null,
        });
        return this.repo.save(item);
    }

    async update(id: string, dto: Partial<{
        codigoInterno: string;
        descripcion: string;
        categoryId: string | null;
        categoria: string; // Compatibility
        rotacion: RotacionType;
        stockMinimo: number;
        stockMaximo: number;
        kilosPorCaja: number;
        pesoConoKg: number;
        costoUnitario?: number;
        unidadPrincipal: string;
        unidadSecundaria: string;
        tono: TonoType | null;
        supplierId: string | null;
        boxTypeId: string | null;
        leadTime: number;
        activo: boolean;
        supplierName: string;
    }>): Promise<ItemEntity> {
        this.validateItemData(dto, true);
        const item = await this.findOne(id);
        const { categoria, supplierName, ...entityData } = dto as any;
        
        // Sanitize: convert empty strings to null for UUID/Enum fields
        const sanitizedData = { ...entityData };
        if (sanitizedData.categoryId === '') sanitizedData.categoryId = null;
        if (sanitizedData.supplierId === '') sanitizedData.supplierId = null;
        if (sanitizedData.boxTypeId === '') sanitizedData.boxTypeId = null;
        if (sanitizedData.tono === '') sanitizedData.tono = null;
        if (sanitizedData.unidadSecundaria === '') sanitizedData.unidadSecundaria = null;

        // Resolve supplier if supplierName provided but no supplierId
        if (!sanitizedData.supplierId && supplierName) {
            const partner = await this.partnersService.upsertByName({
                name: supplierName,
                type: PartnerType.SUPPLIER,
            });
            sanitizedData.supplierId = partner.id;
        }

        const oldSupplierId = item.supplierId;
        const supplierChanged = sanitizedData.supplierId !== undefined && sanitizedData.supplierId !== oldSupplierId;

        await this.dataSource.transaction(async (manager) => {
            // Update only scalar columns from the request. `item` was loaded with
            // its relations, so saving that whole object can persist the old
            // category/supplier relation over a newly supplied foreign-key id.
            await manager.update(ItemEntity, { id }, sanitizedData);

            if (supplierChanged) {
                const newSupplierId = sanitizedData.supplierId ?? null;

                // 1. Cascading update to all batches for this item
                await manager.createQueryBuilder()
                    .update(BatchEntity)
                    .set({ supplierId: newSupplierId })
                    .where('itemId = :itemId', { itemId: id })
                    .execute();

                // 2. Cascading update to stock_balance for this item
                await manager.createQueryBuilder()
                    .update(StockBalanceEntity)
                    .set({ supplierId: newSupplierId })
                    .where('itemId = :itemId', { itemId: id })
                    .execute();

                // 3. Cascading update to documents (REMITO_ENTRADA) where this item was entered
                const movs = await manager.getRepository(MovimientoEntity).find({
                    where: { itemId: id },
                    select: ['documentoId'],
                });
                const docIds = [...new Set(movs.map(m => m.documentoId).filter((d): d is string => Boolean(d)))];
                if (docIds.length > 0) {
                    const docRepo = manager.getRepository(DocumentoEntity);
                    const docsToUpdate = await docRepo.find({
                        where: {
                            id: In(docIds),
                            tipo: TipoDocumento.REMITO_ENTRADA,
                        }
                    });
                    for (const doc of docsToUpdate) {
                        if (!doc.partnerId || (oldSupplierId && doc.partnerId === oldSupplierId)) {
                            doc.partnerId = newSupplierId;
                            await docRepo.save(doc);
                        }
                    }
                }
            }
        });

        return this.findOne(id);
    }

    async getCompleteness(user: any, filters: {
        page?: number;
        pageSize?: number;
        q?: string;
        depositoId?: string;
        level?: 'COMPLETE' | 'REVIEW' | 'CRITICAL';
    }) {
        const page = Math.max(1, Number(filters.page) || 1);
        const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize) || 25));
        const query = this.repo.createQueryBuilder('item')
            .leftJoinAndSelect('item.supplier', 'supplier')
            .leftJoinAndSelect('item.category', 'category')
            .leftJoinAndSelect('category.depot', 'depot')
            .leftJoinAndSelect('item.boxType', 'boxType')
            .where('item.activo = true');

        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const allowedDepots: string[] = user?.allowedDepotIds ?? [];
        if (!isAdmin) {
            if (allowedDepots.length === 0) return { data: [], total: 0, page, pageSize, totalPages: 1, summary: { total: 0, complete: 0, review: 0, critical: 0, averagePct: 0 } };
            query.andWhere('category.depositoId IN (:...allowedDepots)', { allowedDepots });
        }
        if (filters.depositoId) {
            if (!isAdmin && !allowedDepots.includes(filters.depositoId)) {
                return { data: [], total: 0, page, pageSize, totalPages: 1, summary: { total: 0, complete: 0, review: 0, critical: 0, averagePct: 0 } };
            }
            query.andWhere('category.depositoId = :depositoId', { depositoId: filters.depositoId });
        }
        if (filters.q?.trim()) {
            query.andWhere('(item.codigoInterno ILIKE :q OR item.descripcion ILIKE :q OR supplier.name ILIKE :q)', { q: `%${filters.q.trim()}%` });
        }

        const items = await query.orderBy('item.codigoInterno', 'ASC').getMany();
        const evaluated = items.map((item) => {
            const checks = [
                ['Código', Boolean(item.codigoInterno?.trim())],
                ['Descripción', Boolean(item.descripcion?.trim())],
                ['Categoría / depósito', Boolean(item.categoryId && item.category?.depot)],
                ['Unidad principal', Boolean(item.unidadPrincipal?.trim())],
                ['Proveedor', Boolean(item.supplierId)],
                ['Rotación', Boolean(item.rotacion)],
                ['Stock mínimo', item.stockMinimo !== null],
                ['Stock máximo', item.stockMaximo !== null],
                ['Plazo de entrega', item.leadTime !== null],
                ['Embalaje o kg por caja', Boolean(item.boxTypeId) || item.kilosPorCaja !== null],
            ] as Array<[string, boolean]>;
            const completed = checks.filter(([, ok]) => ok).length;
            const completionPct = Math.round((completed / checks.length) * 100);
            const level = completionPct === 100 ? 'COMPLETE' : completionPct >= 70 ? 'REVIEW' : 'CRITICAL';
            return {
                id: item.id,
                codigoInterno: item.codigoInterno,
                descripcion: item.descripcion,
                categoria: item.category?.nombre ?? null,
                depositoId: item.category?.depot?.id ?? null,
                deposito: item.category?.depot?.nombre ?? null,
                supplierName: item.supplier?.name ?? null,
                completionPct,
                level,
                completedFields: completed,
                totalFields: checks.length,
                missingFields: checks.filter(([, ok]) => !ok).map(([label]) => label),
                updatedAt: null,
            };
        });
        const filtered = filters.level ? evaluated.filter((item) => item.level === filters.level) : evaluated;
        filtered.sort((left, right) => left.completionPct - right.completionPct || left.codigoInterno.localeCompare(right.codigoInterno, 'es'));
        const total = filtered.length;
        const start = (page - 1) * pageSize;
        const allTotal = evaluated.length;
        const sum = evaluated.reduce((acc, item) => acc + item.completionPct, 0);
        return {
            data: filtered.slice(start, start + pageSize),
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            summary: {
                total: allTotal,
                complete: evaluated.filter((item) => item.level === 'COMPLETE').length,
                review: evaluated.filter((item) => item.level === 'REVIEW').length,
                critical: evaluated.filter((item) => item.level === 'CRITICAL').length,
                averagePct: allTotal ? Math.round(sum / allTotal) : 0,
            },
        };
    }

    async remove(id: string): Promise<void> {
        const item = await this.findOne(id);
        item.activo = false;
        await this.repo.save(item);
    }

    async upsertByCode(dto: {
        codigoInterno: string;
        descripcion: string;
        categoryId?: string | null;
        categoria?: string; // Compatibility
        rotacion?: RotacionType;
        stockMinimo?: number;
        stockMaximo?: number;
        kilosPorCaja?: number;
        unidadPrincipal: string;
        trackLot?: boolean; // kept for compat
        tono?: TonoType | null;
        leadTime?: number;
        supplierName?: string;
    }): Promise<ItemEntity> {
        let supplierId: string | null = null;
        if (dto.supplierName) {
            const partner = await this.partnersService.upsertByName({
                name: dto.supplierName,
                type: PartnerType.SUPPLIER,
            });
            supplierId = partner.id;
        }

        const existing = await this.repo.findOneBy({ codigoInterno: dto.codigoInterno });
        if (existing) {
            const { categoria, ...updateData } = dto as any;
            Object.assign(existing, { 
                ...updateData, 
                supplierId: supplierId || existing.supplierId 
            });
            return this.repo.save(existing);
        }
        
        const { categoria, ...entityData } = dto as any;
        const item = (this.repo.create({
            id: uuidv4(),
            ...entityData,
            rotacion: dto.rotacion ?? RotacionType.MEDIA,
            supplierId,
            activo: true,
        } as any) as unknown) as ItemEntity;
        return this.repo.save(item);
    }

    async bulkAssignBoxType(dto: {
        boxTypeId: string;
        supplierId?: string;
        categoryId?: string;
        itemId?: string;
    }): Promise<number> {
        const query = this.repo.createQueryBuilder()
            .update(ItemEntity)
            .set({ boxTypeId: dto.boxTypeId })
            .where('activo = :activo', { activo: true });

        if (dto.itemId) {
            query.andWhere('id = :itemId', { itemId: dto.itemId });
        } else {
            if (dto.supplierId) {
                query.andWhere('supplierId = :supplierId', { supplierId: dto.supplierId });
            }
            if (dto.categoryId) {
                query.andWhere('categoryId = :categoryId', { categoryId: dto.categoryId });
            }
        }

        const result = await query.execute();
        return result.affected || 0;
    }

    async syncAllItemRelations(): Promise<{ batchesUpdated: number; stockUpdated: number; docsUpdated: number }> {
        return this.dataSource.transaction(async (manager) => {
            let batchesUpdated = 0;
            let stockUpdated = 0;
            let docsUpdated = 0;

            // 1. Sync batches: update batches where batches.supplierId != item.supplierId
            const batchResult = await manager.query(`
                UPDATE batches b
                SET "supplierId" = i."supplierId"
                FROM items i
                WHERE b."itemId" = i.id
                  AND i."supplierId" IS NOT NULL
                  AND (b."supplierId" IS NULL OR b."supplierId" != i."supplierId")
            `);
            batchesUpdated = batchResult[1] || 0;

            // 2. Sync stock_balance: update stock_balance where stock_balance.supplierId != item.supplierId
            const stockResult = await manager.query(`
                UPDATE stock_balance sb
                SET "supplierId" = i."supplierId"
                FROM items i
                WHERE sb."itemId" = i.id
                  AND i."supplierId" IS NOT NULL
                  AND (sb."supplierId" IS NULL OR sb."supplierId" != i."supplierId")
            `);
            stockUpdated = stockResult[1] || 0;

            // 3. Sync documentos (REMITO_ENTRADA): update documento.partnerId where remito de entrada lines have items with a known supplier
            const docResult = await manager.query(`
                UPDATE documentos d
                SET "partnerId" = sub.target_supplier
                FROM (
                    SELECT m."documentoId", i."supplierId" as target_supplier
                    FROM movimientos m
                    JOIN items i ON m."itemId" = i.id
                    JOIN documentos d2 ON m."documentoId" = d2.id
                    WHERE d2.tipo = 'REMITO_ENTRADA'
                      AND i."supplierId" IS NOT NULL
                      AND (d2."partnerId" IS NULL OR d2."partnerId" != i."supplierId")
                    GROUP BY m."documentoId", i."supplierId"
                ) sub
                WHERE d.id = sub."documentoId"
                  AND d.tipo = 'REMITO_ENTRADA'
                  AND (d."partnerId" IS NULL OR d."partnerId" != sub.target_supplier)
            `);
            docsUpdated = docResult[1] || 0;

            return { batchesUpdated, stockUpdated, docsUpdated };
        });
    }

    async bulkAssignCostByCategory(categoryId: string, costoUnitario: number): Promise<{ updatedCount: number }> {
        const costVal = Number(costoUnitario) || 0;
        const res = await this.repo.createQueryBuilder()
            .update(ItemEntity)
            .set({ costoUnitario: costVal })
            .where('"categoryId" = :categoryId', { categoryId })
            .execute();
        return { updatedCount: res.affected || 0 };
    }

    async bulkAssignCosts(updates: { categoryId: string; costoUnitario: number }[]): Promise<{ updatedCategories: number; totalItemsUpdated: number }> {
        let totalItemsUpdated = 0;
        for (const u of updates) {
            const res = await this.bulkAssignCostByCategory(u.categoryId, u.costoUnitario);
            totalItemsUpdated += res.updatedCount;
        }
        return { updatedCategories: updates.length, totalItemsUpdated };
    }
}
