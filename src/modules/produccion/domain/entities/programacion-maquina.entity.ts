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
import { BalancePedidoVentaEntity } from '../../../ventas/infrastructure/persistence/entities/balance-pedido-venta.entity';
import { MachineEntity } from '../../../maintenance/domain/entities/machine.entity';

export enum EstadoBloqueProgramacion {
    PROGRAMADO = 'PROGRAMADO',
    EN_CURSO = 'EN_CURSO',
    COMPLETADO = 'COMPLETADO',
    PAUSADO = 'PAUSADO',
    CANCELADO = 'CANCELADO',
}

@Entity('programacion_maquinas')
@Index(['tipoPlan', 'maquinaId', 'fechaInicio', 'fechaFin'])
@Index(['pedidoId'])
@Index(['estado'])
export class ProgramacionMaquinaEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tipo_plan', type: 'varchar', length: 20, default: 'REAL' })
    tipoPlan: string; // 'REAL' | 'IDEAL'

    @Column({ name: 'pedido_id', type: 'uuid', nullable: true })
    pedidoId: string | null;

    @ManyToOne(() => BalancePedidoVentaEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'pedido_id' })
    pedido: BalancePedidoVentaEntity | null;

    @Column({ name: 'numero_pedido', type: 'varchar', length: 100 })
    numeroPedido: string;

    @Column({ type: 'varchar', length: 120 })
    cliente: string;

    @Column({ name: 'articulo_codigo', type: 'varchar', length: 100 })
    articuloCodigo: string;

    @Column({ name: 'articulo_descripcion', type: 'varchar', length: 255, nullable: true })
    articuloDescripcion: string | null;

    @Column({ type: 'varchar', length: 30, nullable: true })
    talle: string | null;

    @Column({ name: 'maquina_id', type: 'uuid' })
    maquinaId: string;

    @ManyToOne(() => MachineEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'maquina_id' })
    maquina: MachineEntity;

    @Column({ name: 'maquina_numero', type: 'int' })
    maquinaNumero: number;

    @Column({ name: 'fecha_inicio', type: 'timestamptz' })
    fechaInicio: Date;

    @Column({ name: 'fecha_fin', type: 'timestamptz' })
    fechaFin: Date;

    @Column({ name: 'cantidad_programada_packs', type: 'decimal', precision: 14, scale: 2 })
    cantidadProgramadaPacks: number;

    @Column({ name: 'cantidad_producida_packs', type: 'decimal', precision: 14, scale: 2, default: 0 })
    cantidadProducidaPacks: number;

    @Column({ name: 'bloque_padre_id', type: 'uuid', nullable: true })
    bloquePadreId: string | null;

    @Column({ name: 'es_fraccion', type: 'boolean', default: false })
    esFraccion: boolean;

    @Column({ name: 'numero_fraccion', type: 'int', default: 1 })
    numeroFraccion: number;

    @Column({
        type: 'varchar',
        length: 30,
        default: EstadoBloqueProgramacion.PROGRAMADO,
    })
    estado: string;

    @Column({ name: 'color_identificador', type: 'varchar', length: 30, nullable: true })
    colorIdentificador: string | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
    creadoEn: Date;

    @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
    actualizadoEn: Date;
}
