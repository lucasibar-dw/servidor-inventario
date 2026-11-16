import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PartnerEntity } from 'src/modules/config/infrastructure/persistence/entities/partner.entity';
import { DepotEntity } from 'src/modules/warehouse/infrastructure/persistence/entities/depot.entity';

@Entity('combos_compra')
export class ComboCompraEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    supplierId: string | null;

    @ManyToOne(() => PartnerEntity, { nullable: true })
    @JoinColumn({ name: 'supplierId' })
    supplier: PartnerEntity | null;

    @Column({ name: 'depositoId', type: 'uuid', nullable: true })
    depositoId: string | null;

    @ManyToOne(() => DepotEntity, { nullable: true })
    @JoinColumn({ name: 'depositoId' })
    depot: DepotEntity | null;

    @Column('uuid', { array: true, default: '{}' })
    itemIds: string[];

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    stockMinimo: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    stockMaximo: number | null;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
