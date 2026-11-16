import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { ItemEntity } from '../../../../config/infrastructure/persistence/entities/item.entity';
import { PartnerEntity } from '../../../../config/infrastructure/persistence/entities/partner.entity';

export enum BatchQualityStatus {
    QUARANTINE = 'QUARANTINE',
    RELEASED = 'RELEASED',
}

@Entity('batches')
@Index('IDX_batch_quality_created', ['qualityStatus', 'createdAt'])
export class BatchEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    itemId: string;

    @ManyToOne(() => ItemEntity)
    @JoinColumn({ name: 'itemId' })
    item: ItemEntity;

    @Column()
    lotNumber: string; // El código del lote (ej: "L-2025-001")

    @Column({ type: 'date', nullable: true })
    expirationDate: Date | null;

    @Column({ type: 'date', nullable: true })
    productionDate: Date | null;

    @Column({ nullable: true })
    supplierId: string | null; // Proveedor original de esta partida

    @ManyToOne(() => PartnerEntity)
    @JoinColumn({ name: 'supplierId' })
    supplier: PartnerEntity;

    @CreateDateColumn()
    createdAt: Date; // Fecha de ingreso al sistema

    @Column('jsonb', { nullable: true })
    meta: Record<string, any> | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    /** Los lotes históricos quedan liberados. Los nuevos ingresos se crean en cuarentena. */
    @Column({ type: 'varchar', default: BatchQualityStatus.RELEASED })
    qualityStatus: BatchQualityStatus;

    @Column({ type: 'timestamp', nullable: true })
    qualityTestedAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    qualityTestedBy: string | null;

    @Column({ type: 'text', nullable: true })
    qualityNotes: string | null;
}
