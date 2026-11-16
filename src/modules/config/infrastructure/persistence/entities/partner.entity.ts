import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum PartnerType {
    CLIENT = 'CLIENT',
    SUPPLIER = 'SUPPLIER',
    BOTH = 'BOTH'
}

@Entity('partners')
export class PartnerEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'varchar', nullable: true })
    taxId: string | null; // CUIT/CUIL

    @Column({
        type: 'enum',
        enum: PartnerType,
        default: PartnerType.BOTH
    })
    type: PartnerType;

    @Column({ type: 'varchar', nullable: true })
    email: string | null;

    @Column({ type: 'varchar', nullable: true })
    phone: string | null;

    @Column({ type: 'varchar', nullable: true })
    address: string | null;

    @Column('jsonb', { nullable: true })
    meta: Record<string, any> | null;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
