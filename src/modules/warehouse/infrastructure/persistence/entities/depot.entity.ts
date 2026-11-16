import { Entity, Column, PrimaryColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { PlantEntity } from '../../../../maintenance/domain/entities/plant.entity';


@Entity('depots')
export class DepotEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column()
    nombre: string;

    @Column({ type: 'varchar', nullable: true })
    planta: string | null;

    @Column('uuid', { nullable: true })
    plantId: string | null;

    @ManyToOne(() => PlantEntity)
    @JoinColumn({ name: 'plantId' })
    plant: PlantEntity;


    @Column({ default: true })
    activo: boolean;

    @OneToMany(() => PositionEntity, (position) => position.depot)
    positions: PositionEntity[];
}

@Entity('positions')
export class PositionEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column('uuid')
    depositoId: string;

    @Column()
    codigo: string;

    @Column()
    categoria: string;
    
    @Column('jsonb', { nullable: true })
    meta: Record<string, any> | null;
    
    @Column('float', { nullable: true })
    metrosCubicos: number | null;
    
    @Column({ default: true })
    activo: boolean;

    @ManyToOne(() => DepotEntity, (depot) => depot.positions)
    @JoinColumn({ name: 'depositoId' })
    depot: DepotEntity;

    @Column({ name: 'categoriaPrincipal', type: 'varchar', nullable: true })
    categoriaPrincipal: string | null;

    @Column({ name: 'categoriaSecundaria', type: 'varchar', nullable: true })
    categoriaSecundaria: string | null;
}
