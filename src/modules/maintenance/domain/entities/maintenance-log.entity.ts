import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { MachineEntity, MachineStatus } from './machine.entity';

@Entity('maintenance_logs')
export class MaintenanceLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    machineId: string;

    @Column({
        type: 'enum',
        enum: MachineStatus
    })
    fromStatus: MachineStatus;

    @Column({
        type: 'enum',
        enum: MachineStatus
    })
    toStatus: MachineStatus;

    @Column({ type: 'varchar', nullable: true })
    failureType: string | null;

    @Column({ type: 'text', nullable: true })
    observation: string | null;

    @Column({ type: 'varchar' })
    generatedBy: string; // User or Mechanic

    @ManyToOne(() => MachineEntity)
    @JoinColumn({ name: 'machineId' })
    machine: MachineEntity;

    @CreateDateColumn()
    timestamp: Date;
}
