import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ArticuloEntity } from './articulo.entity';

export enum TipoMovimientoArticulo {
    ENTRADA = 'ENTRADA',
    SALIDA = 'SALIDA',
    AJUSTE_SUMA = 'AJUSTE_SUMA',
    AJUSTE_RESTA = 'AJUSTE_RESTA',
    SACADA_SEGUNDA = 'SACADA_SEGUNDA',
    RECHAZO = 'RECHAZO',
    ANULACION_ENTRADA = 'ANULACION_ENTRADA',
    ANULACION_SALIDA = 'ANULACION_SALIDA',
    ANULACION_AJUSTE_SUMA = 'ANULACION_AJUSTE_SUMA',
    ANULACION_AJUSTE_RESTA = 'ANULACION_AJUSTE_RESTA',
    ANULACION_SACADA_SEGUNDA = 'ANULACION_SACADA_SEGUNDA',
    ANULACION_RECHAZO = 'ANULACION_RECHAZO',
}

export enum MovimientoArticuloStatus {
    ACTIVO = 'ACTIVO',
    ANULADO = 'ANULADO',
}

@Entity('movimientos_articulos')
@Index(['articuloId'])
@Index(['deposito'])
@Index(['tipo'])
@Index(['fecha'])
@Index('IDX_movimiento_articulo_status_date', ['status', 'fecha'])
export class MovimientoArticuloEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'enum',
        enum: TipoMovimientoArticulo,
    })
    tipo: TipoMovimientoArticulo;

    @Column({ type: 'uuid' })
    articuloId: string;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'articuloId' })
    articulo: ArticuloEntity;

    /** Depósito o sector donde se produce el movimiento (ej: TERMINADO, COCIDO, TEJIDO) */
    @Column({ type: 'varchar', length: 50, default: 'TERMINADO' })
    deposito: string;

    /** Cantidad del movimiento (unidades/pares según unidad del artículo) */
    @Column({ type: 'decimal', precision: 14, scale: 3 })
    cantidad: number;

    /** Lote de producción u orden de trabajo (opcional) */
    @Column({ type: 'varchar', length: 100, nullable: true })
    lote: string | null;

    /** Comprobante o documento de respaldo (Remito, OP, Parte de Producción, etc.) */
    @Column({ type: 'varchar', length: 100, nullable: true })
    documentoReferencia: string | null;

    /** Motivo o notas adicionales del movimiento */
    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    /** Fecha operativa del movimiento (YYYY-MM-DD) */
    @Column({ type: 'date' })
    fecha: string;

    /** Identificador o nombre del usuario que realiza la operación */
    @Column({ type: 'varchar', length: 100, nullable: true })
    userId: string | null;

    /** Estado del movimiento para auditoría e integridad contable */
    @Column({
        type: 'enum',
        enum: MovimientoArticuloStatus,
        default: MovimientoArticuloStatus.ACTIVO,
    })
    status: MovimientoArticuloStatus;

    @CreateDateColumn()
    createdAt: Date;
}
