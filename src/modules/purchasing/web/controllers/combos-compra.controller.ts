import { Controller, Get, Post, Patch, Body, Param, Query, Delete, UseGuards } from '@nestjs/common';
import { CombosCompraService } from '../../application/services/combos-compra.service';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { Sectors } from '../../../../infrastructure/auth/decorators/sectors.decorator';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';

@Controller('combos-compra')
@UseGuards(JwtAuthGuard, RolesGuard)
@Sectors('COMPRAS')
export class CombosCompraController {
    constructor(private readonly combosService: CombosCompraService) { }

    @Post()
    async create(@Body() dto: { title: string; supplierId?: string | null; itemIds: string[]; depositoId?: string | null; stockMinimo?: number | null; stockMaximo?: number | null }) {
        return this.combosService.create(dto);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('depositoId') depositoId?: string
    ) {
        return this.combosService.findAll(user, depositoId);
    }

    @Get(':id/breakdown')
    async getBreakdown(@Param('id') id: string) {
        return this.combosService.getBreakdown(id);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() dto: { title?: string; itemIds?: string[]; depositoId?: string | null; stockMinimo?: number | null; stockMaximo?: number | null }) {
        return this.combosService.update(id, dto);
    }

    @Delete(':id')
    @Roles('ADMIN', 'SUPERVISOR')
    async delete(@Param('id') id: string) {
        return this.combosService.delete(id);
    }
}
