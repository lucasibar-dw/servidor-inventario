import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { Sectors } from '../../../../infrastructure/auth/decorators/sectors.decorator';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import { ItemsService } from '../../application/services/items.service';
import { RotacionType, TonoType } from '../../infrastructure/persistence/entities/item.entity';

@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Sectors('DEPOSITO', 'COMPRAS', 'PRODUCCION', 'CALIDAD')
export class ItemsController {
    constructor(private readonly service: ItemsService) { }

    @Get('completeness')
    getCompleteness(
        @CurrentUser() user: any,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('q') q?: string,
        @Query('depositoId') depositoId?: string,
        @Query('level') level?: 'COMPLETE' | 'REVIEW' | 'CRITICAL',
    ) {
        return this.service.getCompleteness(user, { page: Number(page), pageSize: Number(pageSize), q, depositoId, level });
    }

    @Get()
    findAll(
        @CurrentUser() user: any,
        @Query('q') q?: string, 
        @Query('categoryId') categoryId?: string,
        @Query('boxTypeId') boxTypeId?: string,
        @Query('depositoId') depositoId?: string,
    ) {
        return this.service.findAll(user, q, categoryId, boxTypeId, depositoId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() dto: {
        codigoInterno: string;
        descripcion: string;
        categoryId?: string | null;
        rotacion?: RotacionType;
        stockMinimo?: number;
        stockMaximo?: number;
        kilosPorCaja?: number;
        pesoConoKg?: number;
        unidadPrincipal: string;
        unidadSecundaria?: string;
        tono?: TonoType | null;
        supplierId?: string | null;
        boxTypeId?: string | null;
        leadTime?: number;
    }) {
        return this.service.create(dto);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: any) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @Roles('ADMIN', 'SUPERVISOR')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    @Post('sync-relations')
    @Roles('ADMIN', 'SUPERVISOR')
    syncRelations() {
        return this.service.syncAllItemRelations();
    }

    @Post('bulk-box-type')
    @Roles('ADMIN', 'SUPERVISOR')
    bulkAssignBoxType(@Body() dto: {
        boxTypeId: string;
        supplierId?: string;
        categoryId?: string;
        itemId?: string;
    }) {
        return this.service.bulkAssignBoxType(dto);
    }

    @Post('bulk-cost-by-category')
    @Roles('ADMIN', 'SUPERVISOR')
    bulkAssignCostByCategory(@Body() dto: { categoryId: string; costoUnitario: number }) {
        return this.service.bulkAssignCostByCategory(dto.categoryId, dto.costoUnitario);
    }

    @Post('bulk-costs')
    @Roles('ADMIN', 'SUPERVISOR')
    bulkAssignCosts(@Body() dto: { updates: { categoryId: string; costoUnitario: number }[] }) {
        return this.service.bulkAssignCosts(dto.updates);
    }
}
