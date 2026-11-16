import {
    Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { PartnerEntity } from '../../../../config/infrastructure/persistence/entities/partner.entity';
import { DepotEntity } from './depot.entity';
import { UserEntity } from '../../../../config/infrastructure/persistence/entities/user.entity';
import { MovimientoEntity } from './movimiento.entity';

export enum TipoDocumento {
    REMITO_ENTRADA = 'REMITO_ENTRADA',
    REMITO_SALIDA = 'REMITO_SALIDA',
    AJUSTE = 'AJUSTE',
    MOV_INTERNO = 'MOV_INTERNO',
    SOLICITUD_PRODUCCION = 'SOLICITUD_PRODUCCION',
    CIERRE_PRODUCCION = 'CIERRE_PRODUCCION',
}

export enum DocumentoStatus {
    ACTIVO = 'ACTIVO',
    ANULADO = 'ANULADO',
}

@Entity('documentos')
@Index('IDX_documentos_tipo_partner_numero_activo', ['tipo', 'partnerId', 'numero'], { unique: true, where: `"status" = 'ACTIVO'` })
export class DocumentoEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: TipoDocumento })
    tipo: TipoDocumento;

    @Column({ type: 'varchar', length: 50 })
    numero: string;

    @Column({ type: 'date' })
    fecha: string;

    /** Proveedor, Cliente o Tercero involucrado */
    @Column({ type: 'uuid', nullable: true })
    partnerId: string | null;

    /** Depósito principal afectado (opcional según el tipo) */
    @Column({ type: 'uuid', nullable: true })
    depositoId: string | null;

    @ManyToOne(() => PartnerEntity)
    @JoinColumn({ name: 'partnerId' })
    partner: PartnerEntity;

    @ManyToOne(() => DepotEntity)
    @JoinColumn({ name: 'depositoId' })
    deposito: DepotEntity;

    @ManyToOne(() => UserEntity)
    @JoinColumn({ name: 'userId' })
    user: UserEntity;


    @Column({
        type: 'enum',
        enum: DocumentoStatus,
        default: DocumentoStatus.ACTIVO
    })
    status: DocumentoStatus;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @Column({ type: 'uuid', nullable: true })
    userId: string | null;

    @OneToMany(() => MovimientoEntity, (mov) => mov.documento)
    lines: MovimientoEntity[];

    @CreateDateColumn()
    createdAt: Date;
}
