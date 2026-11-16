import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

@Entity('articulos')
export class ArticuloEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Código único del artículo (ej: KT8892_L_B, A161BLANCO) */
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 50 })
    codigo: string;

    /** Descripción del artículo */
    @Column({ type: 'varchar', length: 255 })
    descripcion: string;

    /** Unidad de medida principal (UN, KG, PR, DOC, etc.) */
    @Column({ type: 'varchar', length: 10, default: 'UN' })
    unidadMedida: string;

    /** Marca comercial (ADIDAS, TOPPER, etc.) */
    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    marca: string | null;

    /** Talle (XS, S, M, L, XL, etc.) */
    @Index()
    @Column({ type: 'varchar', length: 20, nullable: true })
    talle: string | null;

    /** Peso unitario */
    @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
    pesoU: number | null;

    /** Código base del modelo (ej: KT8892, JJ3609) */
    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    modelo: string | null;

    /** Destino comercial en productos terminados (AR, UK, BR, etc.) */
    @Column({ type: 'varchar', length: 10, nullable: true })
    destino: string | null;

    /** Variante de color (B, N, G, etc.) */
    @Column({ type: 'varchar', length: 20, nullable: true })
    variante: string | null;

    /** Etapa productiva: TERMINADO | COSTURA | TEJIDO | HILADO | INSUMO */
    @Index()
    @Column({ type: 'varchar', length: 20, nullable: true })
    etapa: string | null;

    /** Familia técnica (CREW LISO, CREW TOALLA, FUTBOL, etc.) */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: true })
    familia: string | null;

    /** Código equivalente en el sistema de Susana / Planilla */
    @Index()
    @Column({ type: 'varchar', length: 80, nullable: true })
    codigoSusi: string | null;

    /** Estado del artículo: CHEQUEADO | CONTROLAR | MAL | DESHABILITADO */
    @Index()
    @Column({ type: 'varchar', length: 15, default: 'CONTROLAR' })
    estado: string;

    /** Estado activo / inactivo */
    @Column({ type: 'boolean', default: true })
    activo: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
