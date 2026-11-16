import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { DepotsService } from '../../application/services/depots.service';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';

@Controller('depots')
@UseGuards(JwtAuthGuard)
export class DepotsController {
    constructor(private readonly service: DepotsService) { }

    @Get()
    findAll(@CurrentUser() user: any) {
        return this.service.findAllDepots(user);
    }

    @Get('archived')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    findArchived() {
        return this.service.findArchivedDepots();
    }

    @Get(':id')
    findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.service.findOneDepot(id, user);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    create(@Body() dto: { nombre: string; planta: string }) {
        return this.service.createDepot(dto);
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    update(@Param('id') id: string, @Body() dto: any) {
        return this.service.updateDepot(id, dto);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    remove(@Param('id') id: string) {
        return this.service.removeDepot(id);
    }

    @Patch(':id/restore')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    restore(@Param('id') id: string) {
        return this.service.restoreDepot(id);
    }

    @Patch('plants/rename')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    renamePlant(@Body() dto: { oldName: string; newName: string }) {
        return this.service.renamePlant(dto.oldName, dto.newName);
    }

    @Patch('plants/toggle')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    togglePlantStatus(@Body() dto: { planta: string; activo: boolean }) {
        return this.service.togglePlantStatus(dto.planta, dto.activo);
    }

    @Get(':id/positions')
    getPositions(@Param('id') id: string) {
        return this.service.findPositionsByDepot(id);
    }

    @Post(':id/positions')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    createPosition(@Param('id') depotId: string, @Body() dto: { codigo: string; categoria: string; categoriaPrincipal?: string | null; categoriaSecundaria?: string | null; metrosCubicos?: number; meta?: Record<string, any> }) {
        return this.service.createPosition(depotId, dto);
    }

    /** POST /depots/:id/positions/bulk — carga masiva temporal */
    @Post(':id/positions/bulk')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    bulkCreatePositions(@Param('id') depotId: string, @Body() dto: { codigos: string[] }) {
        return this.service.bulkCreatePositions(depotId, dto.codigos);
    }
}

@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
    constructor(private readonly service: DepotsService) { }

    @Get(':id')
    findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.service.findOnePosition(id, user);
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    update(@Param('id') id: string, @Body() dto: any) {
        return this.service.updatePosition(id, dto);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN')
    remove(@Param('id') id: string) {
        return this.service.removePosition(id);
    }
}
