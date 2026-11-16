import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('system_audit_logs')
@Index('IDX_system_audit_created', ['createdAt'])
@Index('IDX_system_audit_actor', ['actorId', 'createdAt'])
@Index('IDX_system_audit_resource', ['resource', 'resourceId', 'createdAt'])
export class AuditLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 10 })
    method: string;

    @Column({ type: 'varchar', length: 500 })
    path: string;

    @Column({ type: 'varchar', length: 120 })
    action: string;

    @Column({ type: 'varchar', length: 120 })
    resource: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    resourceId: string | null;

    @Column({ type: 'uuid', nullable: true })
    actorId: string | null;

    @Column({ type: 'varchar', length: 160, nullable: true })
    actorUsername: string | null;

    @Column({ type: 'varchar', length: 60, nullable: true })
    actorRole: string | null;

    @Column({ type: 'varchar', length: 60, nullable: true })
    actorSector: string | null;

    @Column({ type: 'integer', nullable: true })
    statusCode: number | null;

    @Column({ type: 'boolean', default: true })
    success: boolean;

    @Column({ type: 'integer', default: 0 })
    durationMs: number;

    @Column({ type: 'varchar', length: 80, nullable: true })
    ipAddress: string | null;

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ type: 'jsonb', nullable: true })
    details: Record<string, unknown> | null;

    @CreateDateColumn()
    createdAt: Date;
}
