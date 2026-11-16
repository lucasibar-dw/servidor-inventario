import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ArticuloEntity } from './articulo.entity';

@Entity('balance_stock_articulos')
@Index(['articuloId', 'deposito'], { unique: true })
export class BalanceStockArticuloEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    articuloId: string;

    @ManyToOne(() => ArticuloEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'articuloId' })
    articulo: ArticuloEntity;

    /** Depósito o almacén del stock (ej: TERMINADO, COCIDO, TEJIDO) */
    @Column({ type: 'varchar', length: 50, default: 'TERMINADO' })
    deposito: string;

    /** Stock neto actual disponible para este artículo en este depósito */
    @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
    stockActual: number;

    /** Acumulado histórico de ingresos a este depósito */
    @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
    totalEntradas: number;

    /** Acumulado histórico de salidas normales de este depósito */
    @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
    totalSalidas: number;

    /** Acumulado histórico de sacadas de segunda (resta del stock y se registra aquí) */
    @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
    totalSegunda: number;

    /** Acumulado histórico de rechazos/descartes (resta del stock y se registra aquí) */
    @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
    totalRechazos: number;

    @UpdateDateColumn()
    updatedAt: Date;
}
