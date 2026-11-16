import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('machine_types')
export class MachineTypeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    name: string; // TEJEDURIA, COSTURA, PLANCHAS, APILADORAS

    @Column({ type: 'varchar', nullable: true })
    category: string | null;

    @Column({ type: 'varchar', nullable: true })
    marca: string | null;

    @Column({ type: 'varchar', nullable: true })
    modelo: string | null;

    @Column({ type: 'integer', nullable: true, name: 'cant_agujas' })
    cantAgujas: number | null;

    @Column({ type: 'numeric', precision: 4, scale: 2, nullable: true })
    cilindro: number | null;

    @Column({ type: 'varchar', nullable: true })
    puntera: string | null;
}

