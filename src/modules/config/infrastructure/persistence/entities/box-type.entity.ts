import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('box_types')
export class BoxTypeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    nombre: string;

    @Column('decimal', { precision: 10, scale: 2 })
    largoCm: number;

    @Column('decimal', { precision: 10, scale: 2 })
    anchoCm: number;

    @Column('decimal', { precision: 10, scale: 2 })
    altoCm: number;

    @Column('decimal', { 
        precision: 10, 
        scale: 6, 
        transformer: {
            to: (value: number) => value,
            from: (value: string) => parseFloat(value)
        }
    })
    volumenM3: number;

    @Column('decimal', { precision: 10, scale: 2, nullable: true })
    capacidadKilos: number;

    @CreateDateColumn()
    createdAt: Date;
}
