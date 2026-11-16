import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ArticuloEntity } from './articulo.entity';
import { ItemEntity } from '../../../../config/infrastructure/persistence/entities/item.entity';

@Entity('articulo_item_equivalencias')
@Index(['articuloId', 'itemId'], { unique: true })
@Index(['articuloId', 'ordenPrioridad'])
@Index(['codigoArticulo'])
@Index(['codigoItem'])
export class ArticuloItemEquivalenciaEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    articuloId: string;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'articuloId' })
    articulo: ArticuloEntity;

    /** Código redundante del artículo TOTVS para consulta rápida (ej: A161BLANCO) */
    @Column({ type: 'varchar', length: 50 })
    codigoArticulo: string;

    @Column({ type: 'uuid' })
    itemId: string;

    @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'itemId' })
    item: ItemEntity;

    /** Código interno del ítem en nuestro inventario para consulta rápida */
    @Column({ type: 'varchar', length: 50 })
    codigoItem: string;

    /** Orden de prioridad de consumo (1 = Preferido / Principal, 2 = 2da opción, etc.) */
    @Column({ type: 'int', default: 1 })
    ordenPrioridad: number;

    /** Indica si es la opción principal por defecto */
    @Column({ type: 'boolean', default: false })
    esPrincipal: boolean;

    /** Factor de conversión de unidad si difiere (default 1.0) */
    @Column({ type: 'decimal', precision: 10, scale: 4, default: 1.0 })
    factorConversion: number;

    /** Notas u observaciones sobre el uso de este ítem para este artículo */
    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    /** Estado activo de la equivalencia */
    @Column({ type: 'boolean', default: true })
    activo: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
