import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PartnerEntity } from './partner.entity';
import { BoxTypeEntity } from './box-type.entity';
import { ItemCategoryEntity } from './item-category.entity';

export enum RotacionType {
    ALTA = 'ALTA',
    MEDIA = 'MEDIA',
    BAJA = 'BAJA',
    TEMPORAL = 'TEMPORAL',
}

export enum TonoType {
    AMARILLO = 'AMARILLO',
    NARANJA = 'NARANJA',
    AZUL = 'AZUL',
    ROJO = 'ROJO',
    VERDE = 'VERDE',
    MARRON = 'MARRÓN',
    GRIS = 'GRIS',
    VIOLETA = 'VIOLETA',
    ROSA = 'ROSA',
    CELESTE = 'CELESTE',
    BLANCO = 'BLANCO',
    NEGRO = 'NEGRO',
}

@Entity('items')
export class ItemEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ unique: true })
    codigoInterno: string;

    @Column()
    descripcion: string;

    @Column({ name: 'categoryId', type: 'uuid', nullable: true })
    categoryId: string | null;

    @ManyToOne(() => ItemCategoryEntity, { nullable: true })
    @JoinColumn({ name: 'categoryId' })
    category: ItemCategoryEntity | null;

    @Column({
        type: 'enum',
        enum: RotacionType,
        default: RotacionType.MEDIA,
    })
    rotacion: RotacionType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    stockMinimo: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    stockMaximo: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    kilosPorCaja: number | null;

    /** Peso nominal de un cono. Se usa para preparar Producción, no para alterar stock. */
    @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
    pesoConoKg: number | null;

    /** Costo unitario en USD */
    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, nullable: true })
    costoUnitario: number | null;

    @Column()
    unidadPrincipal: string;

    @Column({ type: 'varchar', nullable: true })
    unidadSecundaria: string | null;

    @Column({
        type: 'enum',
        enum: TonoType,
        nullable: true,
        default: null,
    })
    tono: TonoType | null;

    @Column('jsonb', { nullable: true })
    meta: Record<string, any> | null;

    @Column({ type: 'uuid', nullable: true })
    supplierId: string | null;
    
    @ManyToOne(() => PartnerEntity, { nullable: true })
    @JoinColumn({ name: 'supplierId' })
    supplier: PartnerEntity | null;

    @Column({ type: 'uuid', nullable: true })
    boxTypeId: string | null;

    @ManyToOne(() => BoxTypeEntity, { nullable: true })
    @JoinColumn({ name: 'boxTypeId' })
    boxType: BoxTypeEntity | null;

    @Column({ default: true })
    activo: boolean;

    @Column({ type: 'int', nullable: true, default: 7 })
    leadTime: number | null;

    get categoria(): string | null {
        return this.category?.nombre || null;
    }

    get supplierName(): string | null {
        return this.supplier?.name || null;
    }

    get costo(): number {
        return Number(this.costoUnitario ?? this.meta?.costoUnitario ?? 0);
    }
}
