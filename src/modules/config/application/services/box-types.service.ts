import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BoxTypeEntity } from '../../infrastructure/persistence/entities/box-type.entity';

@Injectable()
export class BoxTypesService {
    constructor(
        @InjectRepository(BoxTypeEntity)
        private readonly repo: Repository<BoxTypeEntity>,
    ) { }

    async findAll(): Promise<BoxTypeEntity[]> {
        return this.repo.find({ order: { createdAt: 'DESC' } });
    }

    async findOne(id: string): Promise<BoxTypeEntity> {
        const boxType = await this.repo.findOneBy({ id });
        if (!boxType) throw new NotFoundException(`Tipo de caja ${id} no encontrado`);
        return boxType;
    }

    async create(dto: {
        nombre: string;
        largoCm: number;
        anchoCm: number;
        altoCm: number;
        capacidadKilos?: number;
    }): Promise<BoxTypeEntity> {
        const volumenM3 = (Number(dto.largoCm) * Number(dto.anchoCm) * Number(dto.altoCm)) / 1000000;
        const boxType = this.repo.create({
            id: uuidv4(),
            ...dto,
            volumenM3,
        });
        return this.repo.save(boxType);
    }

    async update(id: string, dto: Partial<{
        nombre: string;
        largoCm: number;
        anchoCm: number;
        altoCm: number;
        capacidadKilos: number;
    }>): Promise<BoxTypeEntity> {
        const boxType = await this.findOne(id);
        
        const largo = dto.largoCm ?? boxType.largoCm;
        const ancho = dto.anchoCm ?? boxType.anchoCm;
        const alto = dto.altoCm ?? boxType.altoCm;

        if (dto.largoCm || dto.anchoCm || dto.altoCm) {
            boxType.volumenM3 = (Number(largo) * Number(ancho) * Number(alto)) / 1000000;
        }

        Object.assign(boxType, dto);
        return this.repo.save(boxType);
    }

    async remove(id: string): Promise<void> {
        const boxType = await this.findOne(id);
        await this.repo.remove(boxType);
    }
}
