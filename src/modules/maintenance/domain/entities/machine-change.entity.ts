import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { MachineEntity } from './machine.entity';

export enum ChangeType {
    COLOR = 'COLOR',
    TALLE = 'TALLE',
    ARTICULO = 'ARTICULO',
    ECONOMIA = 'ECONOMIA',
    PUENTE = 'PUENTE',
    PLATINERO = 'PLATINERO',
}

@Entity('machine_changes')
export class MachineChangeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    machineId: string;

    @Column({ type: 'jsonb' })
    changeTypes: string[];  // Array of ChangeType values

    @Column({ type: 'timestamp' })
    startTime: Date;

    @Column({ type: 'timestamp', nullable: true })
    endTime: Date | null;

    @Column({ type: 'text', nullable: true })
    observation: string | null;

    @Column({ type: 'varchar' })
    generatedBy: string;

    @ManyToOne(() => MachineEntity)
    @JoinColumn({ name: 'machineId' })
    machine: MachineEntity;

    @CreateDateColumn()
    createdAt: Date;
}
