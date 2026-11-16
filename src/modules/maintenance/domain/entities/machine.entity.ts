import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { PlantEntity } from './plant.entity';
import { MachineTypeEntity } from './machine-type.entity';

export enum MachineStatus {
    ACTIVA = 'ACTIVA',
    REVISAR = 'REVISAR',
    VELOCIDAD_REDUCIDA = 'VELOCIDAD_REDUCIDA',
    MUESTRAS = 'MUESTRAS',
    PARADA = 'PARADA',
    ELECTRONIC = 'ELECTRONIC',
    FALTA_COSTURA = 'FALTA_COSTURA',
    FALTA_PROGRAMA = 'FALTA_PROGRAMA',
    REPUESTOS = 'REPUESTOS',
    OTRO = 'OTRO'
}

@Entity('machines')
export class MachineEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'integer' })
    number: number;

    @Column({ type: 'varchar' })
    codigoInterno: string;

    @Column({ type: 'varchar' })
    nombre: string;

    @Column({
        type: 'enum',
        enum: MachineStatus,
        default: MachineStatus.ACTIVA
    })
    status: MachineStatus;

    @Column({ type: 'text', nullable: true })
    lastObservation: string | null;

    @Column({ type: 'varchar', nullable: true })
    lastChangeBy: string | null;

    @Column({ type: 'varchar', nullable: true })
    lastFailureType: string | null;

    @Column('uuid')
    plantId: string;

    @Column('uuid')
    typeId: string;

    @ManyToOne(() => PlantEntity)
    @JoinColumn({ name: 'plantId' })
    plant: PlantEntity;

    @ManyToOne(() => MachineTypeEntity)
    @JoinColumn({ name: 'typeId' })
    type: MachineTypeEntity;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastStatusChange: Date | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;
}
