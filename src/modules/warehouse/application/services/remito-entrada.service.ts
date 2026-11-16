import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { DocumentoEntity, TipoDocumento, DocumentoStatus } from '../../infrastructure/persistence/entities/documento.entity';
import { MovimientoEntity, TipoMovimiento, MovimientoStatus } from '../../infrastructure/persistence/entities/movimiento.entity';
import { BatchEntity, BatchQualityStatus } from '../../infrastructure/persistence/entities/batch.entity';
import { PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { ItemsService } from '../../../config/application/services/items.service';
import { PartnersService } from '../../../config/application/services/partners.service';
import { PartnerType } from '../../../config/infrastructure/persistence/entities/partner.entity';
import { MovimientosService } from './movimientos.service';
import { TasksService } from './tasks.service';
import { TaskType, TaskStatus } from '../../domain/entities/task.entity';
import { TaskPersistenceEntity } from '../../infrastructure/persistence/entities/task.entity';

import { SystemConfigService } from '../../../config/application/services/system-config.service';

export interface RemitoEntradaLineDto {
    itemId?: string;
    codigoInterno?: string;
    descripcion?: string;
    categoria?: string;
    unidadPrincipal?: string;
    trackLot?: boolean;
    lotNumber?: string;
    expirationDate?: string;
    productionDate?: string;
    posicionId?: string;
    qtyPrincipal: number;
    qtySecundaria?: number;
}

export class CreateRemitoEntradaDto {
    numero?: string;
    documentoNumero?: string;
    fecha: string;
    supplierId?: string;
    supplierName?: string;
    supplierTaxId?: string;
    taxId?: string;
    depotId?: string;
    depositoId?: string;
    userId?: string;
    observaciones?: string;
    lines: RemitoEntradaLineDto[];
}

@Injectable()
export class RemitoEntradaService {
    constructor(
        @InjectRepository(DocumentoEntity)
        private readonly docRepo: Repository<DocumentoEntity>,
        @InjectRepository(MovimientoEntity)
        private readonly movRepo: Repository<MovimientoEntity>,
        @InjectRepository(BatchEntity)
        private readonly batchRepo: Repository<BatchEntity>,
        @InjectRepository(PositionEntity)
        private readonly positionRepo: Repository<PositionEntity>,
        private readonly itemsService: ItemsService,
        private readonly partnersService: PartnersService,
        private readonly movimientosService: MovimientosService,
        private readonly tasksService: TasksService,
        private readonly systemConfigService: SystemConfigService,
        private readonly dataSource: DataSource,
    ) { }

    async findAll(): Promise<any[]> {
        return this.docRepo.find({
            where: { tipo: TipoDocumento.REMITO_ENTRADA },
            relations: [
                'partner', 'deposito', 'user', 'lines', 'lines.item', 'lines.item.category',
                'lines.item.supplier', 'lines.batch', 'lines.batch.supplier', 'lines.posicion', 'lines.posicion.depot',
            ],
            order: { fecha: 'DESC', createdAt: 'DESC', lines: { createdAt: 'DESC' } },
        });
    }

    async findOne(id: string): Promise<any> {
        const doc = await this.docRepo.findOne({
            where: { id },
            relations: ['partner', 'deposito', 'user']
        });
        if (!doc) throw new NotFoundException(`Remito de entrada ${id} no encontrado`);

        const lines = await this.movRepo.find({
            where: { documentoId: id },
            relations: ['item', 'item.category', 'item.supplier', 'batch', 'batch.supplier', 'posicion', 'posicion.depot']
        });

        return { ...doc, lines };
    }

    async create(dto: CreateRemitoEntradaDto): Promise<any> {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.fecha ?? '')) throw new BadRequestException('La fecha del remito debe tener formato AAAA-MM-DD.');
        if (!Array.isArray(dto.lines) || dto.lines.length === 0) throw new BadRequestException('El remito debe contener al menos una línea.');
        if (dto.lines.some((line) => !Number.isFinite(Number(line.qtyPrincipal)) || Number(line.qtyPrincipal) <= 0)) {
            throw new BadRequestException('Todas las cantidades principales deben ser mayores a cero.');
        }
        const resultId = await this.dataSource.transaction(async (manager: EntityManager) => {
            // 1. Resolver Proveedor
            let partnerId = dto.supplierId;
            const effectiveTaxId = dto.supplierTaxId || dto.taxId;
            if (!partnerId && dto.supplierName) {
                const supplier = await this.partnersService.upsertByName({
                    name: dto.supplierName,
                    type: PartnerType.SUPPLIER,
                    taxId: effectiveTaxId,
                });
                partnerId = supplier.id;
            }
            if (!partnerId) throw new BadRequestException('Se requiere proveedor');

            // 1.2 Resolver Depósito y Número
            const effectiveDepotId = dto.depotId || dto.depositoId;
            const rawNumero = (dto.numero || dto.documentoNumero)?.trim();
            const numero = rawNumero && rawNumero.length > 0 ? rawNumero : `RE-${Date.now()}`;

            // 1.5 Verificar que no exista un remito activo con el mismo número para este proveedor
            const existingDoc = await manager.findOne(DocumentoEntity, {
                where: { 
                    tipo: TipoDocumento.REMITO_ENTRADA, 
                    partnerId, 
                    numero, 
                    status: DocumentoStatus.ACTIVO 
                }
            });
            if (existingDoc) {
                throw new BadRequestException(`Ya existe un remito de entrada activo con el número "${numero}" para este proveedor.`);
            }

            // 2. Crear Cabecera del Documento
            const documento = manager.create(DocumentoEntity, {
                tipo: TipoDocumento.REMITO_ENTRADA,
                numero,
                fecha: dto.fecha,
                partnerId,
                depositoId: effectiveDepotId,
                userId: dto.userId ?? null,
                observaciones: dto.observaciones ?? null,
                status: DocumentoStatus.ACTIVO,
            });
            const savedDoc = await manager.save(DocumentoEntity, documento);

            const isQuarantine = await this.systemConfigService.isQuarantineEnabled();

            // 3. Procesar Líneas (como Movimientos)
            for (const line of dto.lines) {
                // Resolver Item
                let itemId = line.itemId;
                if (!itemId && line.codigoInterno) {
                    const item = await this.itemsService.upsertByCode({
                        codigoInterno: line.codigoInterno,
                        descripcion: line.descripcion ?? line.codigoInterno,
                        categoria: line.categoria ?? 'GENERAL',
                        unidadPrincipal: line.unidadPrincipal ?? 'KG',
                        trackLot: line.trackLot ?? false,
                    });
                    itemId = item.id;
                }
                if (!itemId) throw new BadRequestException('Cada línea debe tener itemId o codigoInterno');

                // Resolver Lote
                const lotNumber = line.lotNumber?.trim() || `AUTO-${numero}-${itemId.slice(0, 8)}`;
                let batch = await manager.findOneBy(BatchEntity, { itemId, lotNumber });
                if (!batch) {
                    batch = manager.create(BatchEntity, {
                        itemId,
                        lotNumber,
                        supplierId: partnerId,
                        expirationDate: line.expirationDate ? new Date(line.expirationDate) as any : null,
                        productionDate: line.productionDate ? new Date(line.productionDate) as any : null,
                        qualityStatus: isQuarantine ? BatchQualityStatus.QUARANTINE : BatchQualityStatus.RELEASED,
                        qualityTestedAt: isQuarantine ? null : new Date(),
                        qualityTestedBy: isQuarantine ? null : 'Ingreso directo (Cuarentena inactiva)',
                    });
                    batch = await manager.save(BatchEntity, batch);
                }
                const lotId = batch.id;
                let effectivePosicionId = line.posicionId;
                if (!effectivePosicionId && effectiveDepotId) {
                    // Buscar posicion ENTRADA de forma case-insensitive
                    const allPos = await manager.find(PositionEntity, { where: { depositoId: effectiveDepotId } });
                    let pos = allPos.find(p => p.codigo.toUpperCase() === 'ENTRADA');

                    if (pos) {
                        effectivePosicionId = pos.id;
                    } else {
                        // Crear posición de ENTRADA si no existe por alguna razón
                        const newPos = manager.create(PositionEntity, {
                            id: require('uuid').v4(),
                            depositoId: effectiveDepotId,
                            codigo: 'ENTRADA',
                            categoria: 'INPUT',
                            meta: { system: true, description: 'Auto-generada en remito' }

                        });
                        await manager.save(PositionEntity, newPos);
                        effectivePosicionId = newPos.id;
                    }
                }

                if (!effectivePosicionId) {
                    throw new BadRequestException('No se pudo determinar la posición de destino para el item.');
                }

                if (effectivePosicionId) {
                    const pos = await manager.findOneBy(PositionEntity, { id: effectivePosicionId });
                    if (!pos) throw new BadRequestException(`Posición ${effectivePosicionId} no encontrada`);

                    // Registro del Movimiento (Línea de stock)
                    const savedMov = await this.movimientosService.registrar({
                        tipo: TipoMovimiento.REMITO_ENTRADA,
                        depositoId: pos.depositoId,
                        posicionId: effectivePosicionId,
                        itemId,
                        lotId,
                        supplierId: partnerId,
                        qtyPrincipal: Number(line.qtyPrincipal),
                        qtySecundaria: line.qtySecundaria != null ? Number(line.qtySecundaria) : null,
                        documentoId: savedDoc.id,
                        documentoNumero: numero,
                        fecha: dto.fecha,
                        userId: dto.userId ?? null,
                    }, manager);

                    // Lógica de Tareas (Putaway)
                    if (pos.codigo.toUpperCase().includes('ENTRADA')) {
                        const targetPosId = await this.tasksService.suggestPosition(itemId, line.categoria || 'GENERAL');
                        if (targetPosId) {
                            const task = manager.create(TaskPersistenceEntity, {
                                id: require('uuid').v4(),
                                type: TaskType.PUTAWAY,
                                itemId,
                                batchId: lotId,
                                sourcePositionId: effectivePosicionId,
                                targetPositionId: targetPosId,
                                qty: Number(line.qtySecundaria || line.qtyPrincipal),
                                status: TaskStatus.PENDING,
                                priority: 2,
                            });
                            await manager.save(TaskPersistenceEntity, task);
                        }
                    }
                }
            }
            return savedDoc.id;
        });

        return this.findOne(resultId);
    }

    async removeLine(movementId: string): Promise<void> {
        await this.movimientosService.cancelar(movementId);
    }

    async remove(id: string): Promise<void> {
        const doc = await this.docRepo.findOne({ where: { id } });
        if (!doc || doc.status === DocumentoStatus.ANULADO) return;

        await this.dataSource.transaction(async (manager: EntityManager) => {
            // 1. Anular la cabecera del documento
            doc.status = DocumentoStatus.ANULADO;
            await manager.save(DocumentoEntity, doc);

            // 2. Anular todos sus movimientos asociados (esto revierte el stock vía Subscriber)
            const movements = await manager.find(MovimientoEntity, {
                where: { documentoId: id, status: MovimientoStatus.ACTIVO }
            });

            for (const mov of movements) {
                await this.movimientosService.cancelar(mov.id, manager);
            }
        });
    }
}
