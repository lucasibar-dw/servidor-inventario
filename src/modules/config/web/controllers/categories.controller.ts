import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { CategoriesService } from '../../application/services/categories.service';

@Controller('items/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
    constructor(private readonly service: CategoriesService) { }

    @Get()
    findAll(@Request() req: any, @Query('depositoId') depositoId?: string) {
        return this.service.findAll(req.user, depositoId);
    }

    @Post()
    create(@Body() dto: { nombre: string; depositoId: string; minimo?: number; maximo?: number }) {
        return this.service.create(dto);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: { nombre?: string; minimo?: number; maximo?: number; activo?: boolean }) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
