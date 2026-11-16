import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ArticuloEntity } from './articulo.entity';
import { MachineTypeEntity } from '../../../../maintenance/domain/entities/machine-type.entity';

@Entity('articulo_machine_types')
export class ArticuloMachineTypeEntity {
    @PrimaryColumn('uuid')
    articuloId: string;

    @PrimaryColumn('uuid')
    machineTypeId: string;

    @Column({ type: 'numeric', precision: 6, scale: 1, nullable: true })
    cycleTimeSeconds: number | null;

    @Column({ type: 'varchar', length: 50, default: 'MANUAL' })
    timeSource: string; // 'CRONOMETRADO' | 'ESTIMADO_FAMILIA' | 'MANUAL'

    @Column({ type: 'varchar', length: 50, default: 'CONFIRMADO' })
    status: string; // 'CONFIRMADO' | 'ESTIMADO' | 'PENDIENTE'

    @Column({ type: 'boolean', default: false })
    preferida: boolean;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'articuloId' })
    articulo: ArticuloEntity;

    @ManyToOne(() => MachineTypeEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'machineTypeId' })
    machineType: MachineTypeEntity;

    @CreateDateColumn()
    createdAt: Date;
}
