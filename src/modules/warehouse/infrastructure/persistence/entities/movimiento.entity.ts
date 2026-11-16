import {
    Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { ItemEntity } from '../../../../config/infrastructure/persistence/entities/item.entity';
import { BatchEntity } from './batch.entity';
import { PositionEntity, DepotEntity } from './depot.entity';
import { PartnerEntity } from '../../../../config/infrastructure/persistence/entities/partner.entity';
import { UserEntity } from '../../../../config/infrastructure/persistence/entities/user.entity';
import { DocumentoEntity } from './documento.entity';

export enum TipoMovimiento {
    REMITO_ENTRADA = 'REMITO_ENTRADA',
    REMITO_SALIDA = 'REMITO_SALIDA',
    AJUSTE_SUMA = 'AJUSTE_SUMA',
    AJUSTE_RESTA = 'AJUSTE_RESTA',
    MOVE_INTERNO = 'MOVE_INTERNO', // Movimiento entre posiciones
    ANULACION_ENTRADA = 'ANULACION_ENTRADA',
    ANULACION_SALIDA = 'ANULACION_SALIDA',
    ANULACION_AJUSTE_SUMA = 'ANULACION_AJUSTE_SUMA', // Revierte AJUSTE_SUMA (es una RESTA)
    ANULACION_AJUSTE_RESTA = 'ANULACION_AJUSTE_RESTA', // Revierte AJUSTE_RESTA (es una SUMA)
    ENTREGA_PRODUCCION = 'ENTREGA_PRODUCCION',
    ANULACION_ENTREGA_PRODUCCION = 'ANULACION_ENTREGA_PRODUCCION',
    DEVOLUCION_LINEA = 'DEVOLUCION_LINEA',
    ANULACION_DEVOLUCION_LINEA = 'ANULACION_DEVOLUCION_LINEA',
    INGRESO_PRODUCCION = 'INGRESO_PRODUCCION',
    ANULACION_INGRESO_PRODUCCION = 'ANULACION_INGRESO_PRODUCCION',
}

export enum MovimientoStatus {
    ACTIVO = 'ACTIVO',
    ANULADO = 'ANULADO',
}

@Entity('movimientos')
@Index(['itemId'])
@Index(['lotId'])
@Index('IDX_movimiento_status_date', ['status', 'fecha'])
@Index('IDX_movimiento_documento', ['documentoId'])
export class MovimientoEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: TipoMovimiento })
    tipo: TipoMovimiento;

    @Column({ type: 'uuid' })
    posicionId: string;

    @Column({ type: 'uuid' })
    itemId: string;

    @Column({ type: 'uuid', nullable: true })
    lotId: string | null;

    @ManyToOne(() => ItemEntity)
    @JoinColumn({ name: 'itemId' })
    item: ItemEntity;

    @ManyToOne(() => BatchEntity)
    @JoinColumn({ name: 'lotId' })
    batch: BatchEntity;

    @ManyToOne(() => PositionEntity)
    @JoinColumn({ name: 'posicionId' })
    posicion: PositionEntity;

    get deposito() {
        return this.posicion?.depot;
    }

    get supplier() {
        return this.item?.supplier || this.batch?.supplier || this.documento?.partner;
    }

    get categoria() {
        return this.item?.category?.nombre || (this.item as any)?.categoria || null;
    }

    @ManyToOne(() => UserEntity)
    @JoinColumn({ name: 'userId' })
    user: UserEntity;

    @ManyToOne(() => DocumentoEntity, (doc) => doc.lines)
    @JoinColumn({ name: 'documentoId' })
    documento: DocumentoEntity;

    /** Cantidad en la unidad principal del item */
    @Column('decimal', { precision: 14, scale: 3 })
    qtyPrincipal: number;

    /** Cantidad en la unidad secundaria del item (si aplica) */
    @Column('decimal', { precision: 14, scale: 3, nullable: true })
    qtySecundaria: number | null;

    /** ID del documento (Remito, Ajuste, etc.) que originó este movimiento */
    @Column({ type: 'uuid', nullable: true })
    documentoId: string | null;

    /** Número del remito o documento físico (redundante para reporte rápido) */
    @Column({ type: 'varchar', length: 50, nullable: true })
    documentoNumero: string | null;

    @Column({
        type: 'enum',
        enum: MovimientoStatus,
        default: MovimientoStatus.ACTIVO
    })
    status: MovimientoStatus;

    /** Fecha del movimiento (típicamente la del documento) */
    @Column({ type: 'date' })
    fecha: string;

    @Column({ type: 'uuid', nullable: true })
    userId: string | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
