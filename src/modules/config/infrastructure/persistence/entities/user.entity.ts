import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ unique: true })
    username: string;

    @Column()
    passwordHash: string;

    @Column()
    role: string;

    @Column({ type: 'varchar', nullable: true })
    sector: string | null;

    @Column({ type: 'simple-array', nullable: true })
    allowedDepotIds: string[];

    @Column({ default: true })
    isActive: boolean;
}
