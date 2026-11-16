import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TaskStatus, TaskType } from '../../../domain/entities/task.entity';
import { ItemEntity } from '../../../../config/infrastructure/persistence/entities/item.entity';
import { PositionEntity, DepotEntity } from './depot.entity';
import { BatchEntity } from './batch.entity';
import { TaskTypeCatalogEntity } from './task-type-catalog.entity';
import { EmployeeEntity } from '../../../../hr/domain/entities/employee.entity';

@Entity('tasks')
export class TaskPersistenceEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 50 })
    type: TaskType | string;

    @Column({ type: 'uuid', nullable: true })
    depositoId: string | null;

    @ManyToOne(() => DepotEntity, { nullable: true })
    @JoinColumn({ name: 'depositoId' })
    deposito: DepotEntity | null;

    @Column({ type: 'uuid', nullable: true })
    taskTypeId: string | null;

    @ManyToOne(() => TaskTypeCatalogEntity, { nullable: true })
    @JoinColumn({ name: 'taskTypeId' })
    taskType: TaskTypeCatalogEntity | null;

    @Column({ type: 'varchar', length: 200, nullable: true })
    title: string | null;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'varchar', length: 150, nullable: true })
    customerOrDestination: string | null;

    @Column({ type: 'timestamp', nullable: true })
    dueDate: Date | null;

    @Column({ type: 'varchar', length: 50, default: 'DEPOSITO' })
    originSector: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    controlType: string | null;

    @Column({ type: 'varchar', length: 150, nullable: true })
    controlFilter: string | null;

    @Column({ type: 'uuid', nullable: true })
    itemId: string | null;

    @ManyToOne(() => ItemEntity, { nullable: true })
    @JoinColumn({ name: 'itemId' })
    item: ItemEntity | null;

    @Column({ type: 'uuid', nullable: true })
    batchId: string | null;

    @ManyToOne(() => BatchEntity, { nullable: true })
    @JoinColumn({ name: 'batchId' })
    batch: BatchEntity | null;

    @Column({ type: 'uuid', nullable: true })
    sourcePositionId: string | null;

    @ManyToOne(() => PositionEntity, { nullable: true })
    @JoinColumn({ name: 'sourcePositionId' })
    sourcePosition: PositionEntity | null;

    @Column({ type: 'uuid', nullable: true })
    targetPositionId: string | null;

    @ManyToOne(() => PositionEntity, { nullable: true })
    @JoinColumn({ name: 'targetPositionId' })
    targetPosition: PositionEntity | null;

    @Column('decimal', { precision: 14, scale: 3, nullable: true })
    qty: number | null;

    @Column({ type: 'varchar', length: 50, default: TaskStatus.PENDING })
    status: TaskStatus | string;

    @Column({ default: 2 })
    priority: number;

    @Column({ type: 'uuid', nullable: true })
    assignedUserId: string | null;

    @Column({ type: 'uuid', nullable: true })
    assignedEmployeeId: string | null;

    @ManyToOne(() => EmployeeEntity, { nullable: true })
    @JoinColumn({ name: 'assignedEmployeeId' })
    assignedEmployee: EmployeeEntity | null;

    @Column({ type: 'uuid', nullable: true })
    completedByEmployeeId: string | null;

    @ManyToOne(() => EmployeeEntity, { nullable: true })
    @JoinColumn({ name: 'completedByEmployeeId' })
    completedByEmployee: EmployeeEntity | null;

    @Column({ type: 'timestamp', nullable: true })
    startedAt: Date | null;

    @Column({ type: 'int', default: 30, nullable: true })
    tiempoEstimadoMinutos: number | null;

    @Column({ type: 'int', nullable: true })
    tiempoRealMinutos: number | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    resultStatus: string | null;

    @Column({ type: 'text', nullable: true })
    resultNotes: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;
}
