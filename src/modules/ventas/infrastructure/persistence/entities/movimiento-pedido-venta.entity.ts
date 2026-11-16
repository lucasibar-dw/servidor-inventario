import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ArticuloEntity } from '../../../../articulos/infrastructure/persistence/entities/articulo.entity';
import { BalancePedidoVentaEntity } from './balance-pedido-venta.entity';

export enum TipoMovimientoPedidoVenta {
    ALTA_PEDIDO = 'ALTA_PEDIDO',
    AVANCE_TEJIDO = 'AVANCE_TEJIDO',
    AVANCE_COSTURA = 'AVANCE_COSTURA',
    AVANCE_PLANCHA = 'AVANCE_PLANCHA',
    AVANCE_EMPAQUE = 'AVANCE_EMPAQUE',
    ARMADO_DESPACHO = 'ARMADO_DESPACHO',
    REMITO_SALIDA = 'REMITO_SALIDA',
    AJUSTE = 'AJUSTE',
    CANCELACION = 'CANCELACION',
}

@Entity('movimientos_pedidos_ventas')
@Index(['pedidoId'])
@Index(['numeroPedido'])
@Index(['articuloCodigo'])
@Index(['tipoMovimiento'])
@Index(['fecha'])
@Index(['numeroRemito'])
export class MovimientoPedidoVentaEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'pedido_id', type: 'uuid', nullable: true })
    pedidoId: string | null;

    @ManyToOne(() => BalancePedidoVentaEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'pedido_id' })
    pedido: BalancePedidoVentaEntity | null;

    @Column({ name: 'numero_pedido', type: 'varchar', length: 100 })
    numeroPedido: string;

    @Column({ name: 'articulo_id', type: 'uuid', nullable: true })
    articuloId: string | null;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'articulo_id' })
    articulo: ArticuloEntity | null;

    @Column({ name: 'articulo_codigo', type: 'varchar', length: 100 })
    articuloCodigo: string;

    @Column({ name: 'tipo_movimiento', type: 'varchar', length: 50 })
    tipoMovimiento: string;

    @Column({ name: 'cantidad_packs', type: 'decimal', precision: 14, scale: 2 })
    cantidadPacks: number;

    @Column({ name: 'pares_equivalentes', type: 'decimal', precision: 14, scale: 2, default: 0 })
    paresEquivalentes: number;

    @Column({ name: 'estadio_origen', type: 'varchar', length: 50, nullable: true })
    estadioOrigen: string | null;

    @Column({ name: 'estadio_destino', type: 'varchar', length: 50, nullable: true })
    estadioDestino: string | null;

    @Column({ name: 'documento_referencia', type: 'varchar', length: 120, nullable: true })
    documentoReferencia: string | null;

    @Column({ name: 'numero_remito', type: 'varchar', length: 100, nullable: true })
    numeroRemito: string | null;

    @Column({ name: 'usuario_id', type: 'varchar', length: 100, nullable: true })
    usuarioId: string | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @Column({ type: 'timestamptz', default: () => 'NOW()' })
    fecha: Date;

    @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
    creadoEn: Date;
}
