import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, PrimaryGeneratedColumn, Index } from 'typeorm';
import { BatchEntity } from './batch.entity';
import { PositionEntity, DepotEntity } from './depot.entity';

@Entity('stock_balance')
@Index(['depositoId', 'posicionId', 'itemId', 'lotId'], { unique: true })
export class StockBalanceEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    depositoId: string;

    @Column('uuid')
    posicionId: string;

    @Column('uuid')
    itemId: string;

    @Column({ type: 'uuid', nullable: true })
    lotId: string | null;

    @ManyToOne(() => BatchEntity)
    @JoinColumn({ name: 'lotId' })
    batch: BatchEntity;

    @ManyToOne(() => PositionEntity)
    @JoinColumn({ name: 'posicionId' })
    posicion: PositionEntity;

    @ManyToOne(() => DepotEntity)
    @JoinColumn({ name: 'depositoId' })
    deposito: DepotEntity;

    @Column({ type: 'uuid', nullable: true })
    supplierId: string | null;

    @Column('decimal', { precision: 14, scale: 3 })
    qtyPrincipal: number;

    @Column('decimal', { precision: 14, scale: 3, nullable: true })
    qtySecundaria: number | null;
}


