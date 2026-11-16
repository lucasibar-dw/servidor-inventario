import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { InventoryCheckService } from '../../application/services/inventory-check.service';

@ApiTags('Warehouse/InventoryChecks')
@ApiBearerAuth()
@Controller('inventory-checks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryCheckController {
    constructor(private readonly service: InventoryCheckService) {}

    @Post()
    @Roles('SUPERVISOR', 'ADMIN', 'OPERARIO')
    @ApiOperation({ summary: 'Create a new inventory check session for a depot or category' })
    create(
        @CurrentUser() user: { id: string },
        @Body() body: { depositoId: string; categoryId?: string }
    ) {
        return this.service.create(body.depositoId, user.id, body.categoryId);
    }

    @Get()
    @ApiOperation({ summary: 'List inventory checks' })
    findAll(
        @Query('depositoId') depositoId?: string,
        @Query('categoryId') categoryId?: string,
        @Query('status') status?: string,
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
    ) {
        return this.service.findAll({ depositoId, categoryId, status, desde, hasta });
    }

    @Get('analytics')
    @ApiOperation({ summary: 'Get executive dashboard analytics for inventory checks' })
    getDashboardAnalytics() {
        return this.service.getDashboardAnalytics();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a specific inventory check by ID with items' })
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Patch(':id/items/:itemId')
    @ApiOperation({ summary: 'Update a specific item tag and observations' })
    updateItem(
        @Param('id') checkId: string,
        @Param('itemId') itemId: string,
        @Body() body: {
            tag: string;
            observacion?: string | null;
            notaLibre?: string | null;
            realQtyPrincipal?: number | null;
            realQtySecundaria?: number | null;
        }
    ) {
        return this.service.updateItem(checkId, itemId, body);
    }

    @Patch(':id/complete')
    @Roles('SUPERVISOR', 'ADMIN', 'OPERARIO')
    @ApiOperation({ summary: 'Mark an inventory check as completed' })
    complete(@Param('id') id: string) {
        return this.service.complete(id);
    }

    @Get(':id/report')
    @ApiOperation({ summary: 'Get a summary report of the inventory check' })
    getReport(@Param('id') id: string) {
        return this.service.getReport(id);
    }
}
