import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ArticuloEntity } from '../../../../articulos/infrastructure/persistence/entities/articulo.entity';

export enum EstadoPedidoVenta {
    PENDIENTE_ESTRUCTURA = 'PENDIENTE_ESTRUCTURA',
    CONFIRMADO = 'CONFIRMADO',
    EN_TEJIDO = 'EN_TEJIDO',
    EN_COSTURA = 'EN_COSTURA',
    EN_PLANCHA = 'EN_PLANCHA',
    EMPAQUETADO = 'EMPAQUETADO',
    ARMADO_DESPACHO = 'ARMADO_DESPACHO',
    DESPACHADO = 'DESPACHADO',
    CANCELADO = 'CANCELADO',
}

@Entity('balance_pedidos_ventas')
@Index(['numeroPedido'])
@Index(['cliente'])
@Index(['articuloCodigo'])
@Index(['estado'])
@Index(['tieneEstructura'])
@Index(['fechaPedido'])
export class BalancePedidoVentaEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'numero_pedido', type: 'varchar', length: 100 })
    numeroPedido: string;

    @Column({ type: 'varchar', length: 120 })
    cliente: string;

    @Column({ type: 'varchar', length: 80, default: 'ARGENTINA' })
    destino: string;

    @Column({ name: 'fecha_pedido', type: 'date', default: () => 'CURRENT_DATE' })
    fechaPedido: string;

    @Column({ name: 'fecha_entrega', type: 'date', nullable: true })
    fechaEntrega: string | null;

    @Column({ name: 'articulo_id', type: 'uuid', nullable: true })
    articuloId: string | null;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'articulo_id' })
    articulo: ArticuloEntity | null;

    @Column({ name: 'articulo_codigo', type: 'varchar', length: 100 })
    articuloCodigo: string;

    @Column({ name: 'articulo_descripcion', type: 'varchar', length: 255, nullable: true })
    articuloDescripcion: string | null;

    @Column({ type: 'varchar', length: 30, nullable: true })
    talle: string | null;

    @Column({ name: 'pares_por_pack', type: 'int', default: 1 })
    paresPorPack: number;

    @Column({ name: 'packs_pedidas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsPedidas: number;

    @Column({ name: 'packs_tejidas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsTejidas: number;

    @Column({ name: 'packs_cocidas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsCocidas: number;

    @Column({ name: 'packs_planchadas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsPlanchadas: number;

    @Column({ name: 'packs_empaquetadas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsEmpaquetadas: number;

    @Column({ name: 'packs_armadas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsArmadas: number;

    @Column({ name: 'packs_despachadas', type: 'decimal', precision: 14, scale: 2, default: 0 })
    packsDespachadas: number;

    /** Columna calculada o persistida: packsPedidas - packsDespachadas */
    @Column({
        name: 'saldo_pendiente',
        type: 'decimal',
        precision: 14,
        scale: 2,
        insert: false,
        update: false,
    })
    saldoPendiente: number;

    @Column({ name: 'porcentaje_completo', type: 'decimal', precision: 5, scale: 2, default: 0 })
    porcentajeCompleto: number;

    @Column({
        type: 'varchar',
        length: 50,
        default: EstadoPedidoVenta.PENDIENTE_ESTRUCTURA,
    })
    estado: string;

    @Column({ name: 'tiene_estructura', type: 'boolean', default: false })
    tieneEstructura: boolean;

    @Column({ type: 'varchar', length: 20, default: 'NORMAL' })
    prioridad: string;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
    creadoEn: Date;

    @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
    actualizadoEn: Date;
}
