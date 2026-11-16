import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { DocumentoEntity, TipoDocumento, DocumentoStatus } from '../../infrastructure/persistence/entities/documento.entity';
import { MovimientoEntity, TipoMovimiento, MovimientoStatus } from '../../infrastructure/persistence/entities/movimiento.entity';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';
import { PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { BatchEntity, BatchQualityStatus } from '../../infrastructure/persistence/entities/batch.entity';
import { ItemEntity } from '../../../config/infrastructure/persistence/entities/item.entity';
import { PartnersService } from '../../../config/application/services/partners.service';
import { PartnerType } from '../../../config/infrastructure/persistence/entities/partner.entity';
import { MovimientosService } from './movimientos.service';

export interface RemitoSalidaLineInput {
    itemId: string;
    qtyPrincipal: number;
    qtySecundaria?: number;
    lotId?: string | null;
    posicionId?: string | null;
}

export class CreateRemitoSalidaDto {
    numero?: string;
    fecha: string;
    clientId?: string;
    clientName?: string;
    userId?: string;
    observaciones?: string;
    lines: RemitoSalidaLineInput[];
}

export interface FifoDeductionLine {
    itemId: string;
    itemDescripcion: string;
    lotId: string | null;
    lotNumber: string | null;
    posicionId: string;
    posicionCodigo: string;
    depositoId: string;
    qtyPrincipalDescontada: number;
    qtyPrincipalRestanteEnPosicion: number;
}

export interface PreviewResult {
    lines: FifoDeductionLine[];
    warnings: string[];
}

@Injectable()
export class RemitoSalidaService {
    constructor(
        @InjectRepository(DocumentoEntity)
        private readonly docRepo: Repository<DocumentoEntity>,
        @InjectRepository(MovimientoEntity)
        private readonly movRepo: Repository<MovimientoEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockRepo: Repository<StockBalanceEntity>,
        @InjectRepository(PositionEntity)
        private readonly positionRepo: Repository<PositionEntity>,
        @InjectRepository(BatchEntity)
        private readonly batchRepo: Repository<BatchEntity>,
        @InjectRepository(ItemEntity)
        private readonly itemRepo: Repository<ItemEntity>,
        private readonly partnersService: PartnersService,
        private readonly movimientosService: MovimientosService,
        private readonly dataSource: DataSource,
    ) { }

    async findAll(): Promise<any[]> {
        return this.docRepo.find({
            where: { tipo: TipoDocumento.REMITO_SALIDA },
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
        if (!doc) throw new NotFoundException(`Remito de salida ${id} no encontrado`);
        
        const lines = await this.movRepo.find({ 
            where: { documentoId: id },
            relations: ['item', 'item.category', 'item.supplier', 'batch', 'batch.supplier', 'posicion', 'posicion.depot']
        });
        
        return { ...doc, lines };
    }

    async preview(lines: RemitoSalidaLineInput[]): Promise<PreviewResult> {
        const result: FifoDeductionLine[] = [];
        const warnings: string[] = [];

        const pickingPositions = await this.positionRepo.find({ where: { categoria: 'PICKING' } });
        const pickingIds = pickingPositions.map(p => p.id);

        for (const line of lines) {
            let remaining = Number(line.qtyPrincipal);
            const item = await this.itemRepo.findOneBy({ id: line.itemId });
            if (!item) { warnings.push(`Item ${line.itemId} no encontrado`); continue; }

            // Si se especifican manualmente la posición y el lote
            if (line.posicionId && line.lotId) {
                const bal = await this.stockRepo.findOne({
                    where: { itemId: line.itemId, posicionId: line.posicionId, lotId: line.lotId },
                    relations: ['batch', 'posicion']
                });
                if (bal?.batch?.qualityStatus === BatchQualityStatus.QUARANTINE) {
                    warnings.push(`El lote ${bal.batch.lotNumber} está en cuarentena y todavía no puede salir.`);
                    continue;
                }
                
                const available = bal ? Number(bal.qtyPrincipal) : 0;
                const toDeduct = Math.min(remaining, available);
                
                const pos = await this.positionRepo.findOneBy({ id: line.posicionId });
                const batch = await this.batchRepo.findOneBy({ id: line.lotId });

                result.push({
                    itemId: line.itemId,
                    itemDescripcion: item.descripcion,
                    lotId: line.lotId,
                    lotNumber: batch?.lotNumber ?? line.lotId,
                    posicionId: line.posicionId,
                    posicionCodigo: pos?.codigo ?? line.posicionId,
                    depositoId: pos?.depositoId ?? '',
                    qtyPrincipalDescontada: toDeduct,
                    qtyPrincipalRestanteEnPosicion: available - toDeduct,
                });
                
                remaining -= toDeduct;
                if (remaining > 0) {
                    warnings.push(`Stock insuficiente para ${item.descripcion} en posición ${pos?.codigo ?? line.posicionId}: faltan ${remaining.toFixed(2)} unidades`);
                }
                continue;
            }

            if (pickingIds.length === 0) {
                warnings.push(`No hay posiciones de tipo PICKING para ${item.descripcion}`);
                continue;
            }

            const balances = await this.stockRepo
                .createQueryBuilder('sb')
                .innerJoinAndSelect('sb.batch', 'batch')
                .leftJoinAndSelect('sb.posicion', 'pos')
                .where('sb.itemId = :itemId', { itemId: line.itemId })
                .andWhere('sb.posicionId IN (:...pickingIds)', { pickingIds })
                .andWhere('sb.qtyPrincipal > 0')
                .andWhere('batch.qualityStatus = :released', { released: BatchQualityStatus.RELEASED })
                .orderBy('COALESCE(batch.productionDate, CAST(batch.createdAt AS date))', 'ASC')
                .addOrderBy('batch.createdAt', 'ASC')
                .addOrderBy('sb.id', 'ASC')
                .getMany();

            for (const bal of balances) {
                if (remaining <= 0) break;
                const available = Number(bal.qtyPrincipal);
                const toDeduct = Math.min(remaining, available);

                result.push({
                    itemId: line.itemId,
                    itemDescripcion: item.descripcion,
                    lotId: bal.lotId,
                    lotNumber: (bal as any).batch?.lotNumber ?? bal.lotId,
                    posicionId: bal.posicionId,
                    posicionCodigo: (bal as any).posicion?.codigo ?? bal.posicionId,
                    depositoId: bal.depositoId,
                    qtyPrincipalDescontada: toDeduct,
                    qtyPrincipalRestanteEnPosicion: available - toDeduct,
                });

                remaining -= toDeduct;
            }

            if (remaining > 0) {
                warnings.push(`Stock insuficiente para ${item.descripcion}: faltan ${remaining.toFixed(2)} unidades en picking`);
            }
        }

        return { lines: result, warnings };
    }

    async create(dto: CreateRemitoSalidaDto): Promise<any> {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.fecha ?? '')) throw new BadRequestException('La fecha del remito debe tener formato AAAA-MM-DD.');
        if (!Array.isArray(dto.lines) || dto.lines.length === 0) throw new BadRequestException('El remito debe contener al menos una línea.');
        if (dto.lines.some((line) => !Number.isFinite(Number(line.qtyPrincipal)) || Number(line.qtyPrincipal) <= 0)) {
            throw new BadRequestException('Todas las cantidades principales deben ser mayores a cero.');
        }
        const resultId = await this.dataSource.transaction(async (manager: EntityManager) => {
            let partnerId = dto.clientId;
            if (!partnerId && dto.clientName) {
                const client = await this.partnersService.upsertByName({ name: dto.clientName, type: PartnerType.BOTH });
                partnerId = client.id;
            }

            const numero = dto.numero ?? `RS-${Date.now()}`;

            const existingDoc = await manager.findOne(DocumentoEntity, {
                where: { tipo: TipoDocumento.REMITO_SALIDA, numero, status: DocumentoStatus.ACTIVO }
            });
            if (existingDoc) {
                throw new BadRequestException(`Ya existe un remito de salida activo con el número "${numero}".`);
            }

            const documento = manager.create(DocumentoEntity, {
                tipo: TipoDocumento.REMITO_SALIDA,
                numero,
                fecha: dto.fecha,
                partnerId,
                userId: dto.userId ?? null,
                observaciones: dto.observaciones ?? null,
                status: DocumentoStatus.ACTIVO,
            });
            const savedDoc = await manager.save(DocumentoEntity, documento);

            const preview = await this.preview(dto.lines);
            if (preview.warnings.length > 0) {
                throw new BadRequestException(preview.warnings.join(' '));
            }

            for (const deduction of preview.lines) {
                // Registrar movimiento de salida
                await this.movimientosService.registrar({
                    tipo: TipoMovimiento.REMITO_SALIDA,
                    depositoId: deduction.depositoId,
                    posicionId: deduction.posicionId,
                    itemId: deduction.itemId,
                    lotId: deduction.lotId,
                    qtyPrincipal: Number(deduction.qtyPrincipalDescontada),
                    documentoId: savedDoc.id,
                    documentoNumero: numero,
                    fecha: dto.fecha,
                    userId: dto.userId ?? null,
                }, manager);
            }

            return savedDoc.id;
        });

        return this.findOne(resultId);
    }

    async remove(id: string): Promise<void> {
        const doc = await this.docRepo.findOne({ where: { id } });
        if (!doc || doc.status === DocumentoStatus.ANULADO) return;

        await this.dataSource.transaction(async (manager: EntityManager) => {
            // 1. Anular el documento
            doc.status = DocumentoStatus.ANULADO;
            await manager.save(DocumentoEntity, doc);

            // 2. Anular todos sus movimientos asociados (esto restaura stock vía Subscriber)
            const movements = await manager.find(MovimientoEntity, {
                where: { documentoId: id, status: MovimientoStatus.ACTIVO }
            });

            for (const mov of movements) {
                await this.movimientosService.cancelar(mov.id, manager);
            }
        });
    }

    async removeLine(movementId: string): Promise<void> {
        await this.movimientosService.cancelar(movementId);
    }

    /**
     * Despacho Directo: allows dispatching from a specific stock position/lot.
     * Groups lines into the same remito by date + client.
     */
    async despachoDirecto(dto: {
        fecha: string;
        clientId?: string;
        clientName?: string;
        depositoId: string;
        posicionId: string;
        itemId: string;
        lotId: string;
        qtyPrincipal: number;
        qtySecundaria?: number;
        userId?: string;
    }): Promise<any> {
        return this.dataSource.transaction(async (manager: EntityManager) => {
            // Resolve client
            // Resolve client
            let partnerId = dto.clientId || null;
            if (!partnerId && dto.clientName) {
                // Create as BOTH (client and supplier) for admin usage
                const client = await this.partnersService.upsertByName({ name: dto.clientName, type: PartnerType.BOTH });
                partnerId = client.id;
            }

            // Try to find an existing ACTIVO remito for same date + client
            let doc: DocumentoEntity | null = null;
            if (partnerId) {
                doc = await manager.findOne(DocumentoEntity, {
                    where: {
                        tipo: TipoDocumento.REMITO_SALIDA,
                        fecha: dto.fecha,
                        partnerId,
                        status: DocumentoStatus.ACTIVO,
                    },
                    order: { createdAt: 'DESC' },
                });
            }

            if (!doc) {
                // Create a new remito
                doc = manager.create(DocumentoEntity, {
                    tipo: TipoDocumento.REMITO_SALIDA,
                    numero: `RS-${Date.now()}`,
                    fecha: dto.fecha,
                    partnerId,
                    depositoId: dto.depositoId,
                    userId: dto.userId ?? null,
                    observaciones: null,
                    status: DocumentoStatus.ACTIVO,
                });
                doc = await manager.save(DocumentoEntity, doc);
            }

            // Verify stock balance exists
            const balance = await manager.findOne(StockBalanceEntity, {
                where: {
                    depositoId: dto.depositoId,
                    posicionId: dto.posicionId,
                    itemId: dto.itemId,
                    lotId: dto.lotId,
                },
                relations: ['batch'],
            });

            if (!balance || Number(balance.qtyPrincipal) < dto.qtyPrincipal) {
                throw new BadRequestException(
                    `Stock insuficiente. Disponible: ${balance ? Number(balance.qtyPrincipal).toFixed(2) : '0'}`
                );
            }
            if (balance.batch?.qualityStatus === BatchQualityStatus.QUARANTINE) {
                throw new BadRequestException(`El lote ${balance.batch.lotNumber} está en cuarentena y todavía no puede salir.`);
            }

            // Register the movement
            await this.movimientosService.registrar({
                tipo: TipoMovimiento.REMITO_SALIDA,
                depositoId: dto.depositoId,
                posicionId: dto.posicionId,
                itemId: dto.itemId,
                lotId: dto.lotId,
                qtyPrincipal: dto.qtyPrincipal,
                qtySecundaria: dto.qtySecundaria ?? null,
                documentoId: doc.id,
                documentoNumero: doc.numero,
                fecha: dto.fecha,
                userId: dto.userId ?? null,
            }, manager);

            return { documentoId: doc.id, numero: doc.numero, isNew: !partnerId };
        });
    }
}
