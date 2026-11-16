import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('employees')
@Index('UQ_employees_legajo', ['legajo'], { unique: true })
export class EmployeeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    legajo: string;

    @Column({ type: 'varchar', nullable: true })
    fullName: string | null;

    @Column({ type: 'varchar', nullable: true })
    primarySectorCode: string | null;

    @Column({ type: 'uuid', nullable: true })
    depositoId: string | null;

    @Column({ type: 'varchar', nullable: true })
    subSector: string | null; // e.g. 'HILADO', 'PACKAGING', 'GENERAL'

    @Column({ type: 'boolean', default: true })
    active: boolean;

    @Column({ type: 'varchar', nullable: true })
    source: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
