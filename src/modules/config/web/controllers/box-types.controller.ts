import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { BoxTypesService } from '../../application/services/box-types.service';

@Controller('box-types')
@UseGuards(JwtAuthGuard)
export class BoxTypesController {
    constructor(private readonly service: BoxTypesService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() dto: {
        nombre: string;
        largoCm: number;
        anchoCm: number;
        altoCm: number;
        capacidadKilos?: number;
    }) {
        return this.service.create(dto);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: any) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
