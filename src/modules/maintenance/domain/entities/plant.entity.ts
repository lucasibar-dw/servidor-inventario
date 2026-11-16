import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('plants')
export class PlantEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    name: string;
    
    @Column({ type: 'varchar', nullable: true })
    location: string | null;
}
