import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { DepotEntity, PositionEntity } from './depot.entity';
import { ItemCategoryEntity } from '../../../../config/infrastructure/persistence/entities/item-category.entity';

@Entity('inventory_checks')
export class InventoryCheckEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    depositoId: string;

    @ManyToOne(() => DepotEntity)
    @JoinColumn({ name: 'depositoId' })
    depot: DepotEntity;

    @Column({ name: 'categoryId', type: 'uuid', nullable: true })
    categoryId: string | null;

    @ManyToOne(() => ItemCategoryEntity, { nullable: true })
    @JoinColumn({ name: 'categoryId' })
    category: ItemCategoryEntity | null;

    @Column('uuid')
    userId: string;

    @Column({ type: 'varchar' })
    status: 'EN_PROGRESO' | 'COMPLETADO';

    @CreateDateColumn()
    startedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @OneToMany(() => InventoryCheckItemEntity, item => item.check, { cascade: true })
    items: InventoryCheckItemEntity[];
}

@Entity('inventory_check_items')
export class InventoryCheckItemEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    checkId: string;

    @ManyToOne(() => InventoryCheckEntity, check => check.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'checkId' })
    check: InventoryCheckEntity;

    @Column('uuid')
    posicionId: string;

    @ManyToOne(() => PositionEntity)
    @JoinColumn({ name: 'posicionId' })
    posicion: PositionEntity;

    @Column({ type: 'varchar' })
    posicionCodigo: string;

    @Column({ type: 'varchar' })
    tag: 'PENDIENTE' | 'CORRECTO' | 'FALTA' | 'SOBRA' | 'CANTIDAD_INCORRECTA' | 'A_CHEQUEAR' | 'POSICION_INCORRECTA';

    @Column({ type: 'varchar', nullable: true })
    observacion: string | null;

    @Column({ type: 'text', nullable: true })
    notaLibre: string | null;

    @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
    realQtyPrincipal: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
    realQtySecundaria: number | null;

    @Column('jsonb', { nullable: true })
    stockSnapshot: any | null;

    @Column({ type: 'timestamp', nullable: true })
    checkedAt: Date | null;
}
