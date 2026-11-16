import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DepotEntity } from './depot.entity';

export enum TaskTipoGeneral {
    CUSTOMER_ORDER = 'CUSTOMER_ORDER',
    INVENTORY_CONTROL = 'INVENTORY_CONTROL',
    PUTAWAY = 'PUTAWAY',
    EXTRAORDINARY = 'EXTRAORDINARY',
    REPLENISHMENT = 'REPLENISHMENT',
}

@Entity('task_type_catalog')
export class TaskTypeCatalogEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ length: 50, unique: true })
    codigo: string;

    @Column({ length: 150 })
    nombre: string;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    @Column({ type: 'uuid', nullable: true })
    depositoId: string | null;

    @ManyToOne(() => DepotEntity, { nullable: true })
    @JoinColumn({ name: 'depositoId' })
    deposito: DepotEntity | null;

    @Column({
        type: 'varchar',
        length: 50,
        default: TaskTipoGeneral.EXTRAORDINARY,
    })
    tipoGeneral: TaskTipoGeneral | string;

    @Column({ type: 'int', default: 30 })
    tiempoEstimadoMinutos: number;

    @Column({ type: 'boolean', default: true })
    activo: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
