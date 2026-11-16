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

@Entity('articulo_estructuras')
@Index(['codigoPadre'])
@Index(['codigoComponente'])
@Index(['codigoPadre', 'codigoComponente'], { unique: true })
export class ArticuloEstructuraEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Código del producto padre (G1_COD) */
    @Column({ type: 'varchar', length: 50 })
    codigoPadre: string;

    /** Código del componente hijo (G1_COMP) */
    @Column({ type: 'varchar', length: 50 })
    codigoComponente: string;

    /** Relación opcional con la entidad del artículo padre */
    @Column({ type: 'uuid', nullable: true })
    articuloPadreId: string | null;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'articuloPadreId' })
    articuloPadre: ArticuloEntity | null;

    /** Relación opcional con la entidad del artículo hijo/componente */
    @Column({ type: 'uuid', nullable: true })
    articuloHijoId: string | null;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'articuloHijoId' })
    articuloHijo: ArticuloEntity | null;

    /** Consumo o cantidad unitaria requerida para 1 unidad del padre */
    @Column({ type: 'decimal', precision: 14, scale: 6 })
    cantidad: number;

    /** Cantidad en segunda unidad de medida (opcional) */
    @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
    cantidadSecundaria: number | null;

    /** Descripción legible del insumo/componente */
    @Column({ type: 'varchar', length: 255, nullable: true })
    descripcionInsumo: string | null;

    /** Observación técnica del componente en la estructura */
    @Column({ type: 'text', nullable: true })
    observacion: string | null;

    /** Estado activo de la relación */
    @Column({ type: 'boolean', default: true })
    activo: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
