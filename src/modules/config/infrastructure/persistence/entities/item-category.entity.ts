import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { DepotEntity } from '../../../../warehouse/infrastructure/persistence/entities/depot.entity';

@Entity('item_categories')
@Unique(['nombre', 'depositoId'])
export class ItemCategoryEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    nombre: string;

    @Column({ name: 'depositoId', type: 'uuid' })
    depositoId: string;

    @ManyToOne(() => DepotEntity)
    @JoinColumn({ name: 'depositoId' })
    depot: DepotEntity;

    @Column({ name: 'activo', default: true })
    activo: boolean;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: null })
    minimo: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: null })
    maximo: number | null;
}
