import {
    Controller, Get, Post, Patch, Delete,
    Query, Body, UseGuards, Request, Param, Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { StockService } from '../../application/services/stock.service';
import { DashboardService } from '../../application/services/dashboard.service';

@ApiTags('Warehouse/Stock')
@ApiBearerAuth()
@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
    constructor(private readonly service: StockService) { }

    @Get()
    @ApiOperation({ summary: 'Find all stock' })
    findAll(
        @CurrentUser() user: any,
        @Query('depotId') depotId?: string,
        @Query('positionId') positionId?: string,
        @Query('supplierId') supplierId?: string,
        @Query('itemId') itemId?: string,
        @Query('lotNumber') lotNumber?: string,
        @Query('categoria') categoria?: string,
        @Query('categoryId') categoryId?: string,
        @Query('q') q?: string,
        @Query('limit') limit?: number,
    ) {
        return this.service.findAll({ depotId, positionId, supplierId, itemId, lotNumber, categoria, categoryId, q, limit }, user);
    }

    @Get('export')
    async export(
        @CurrentUser() user: any,
        @Res() res: Response,
        @Query('depotId') depotId?: string,
        @Query('positionId') positionId?: string,
        @Query('supplierId') supplierId?: string,
        @Query('itemId') itemId?: string,
        @Query('lotNumber') lotNumber?: string,
        @Query('categoria') categoria?: string,
        @Query('categoryId') categoryId?: string,
        @Query('q') q?: string,
    ) {
        const buffer = await this.service.exportStock({ depotId, positionId, supplierId, itemId, lotNumber, categoria, categoryId, q }, user);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=stock.xlsx');
        res.send(buffer);
    }

    @Get('alerts')
    getAlerts() {
        return this.service.getAlerts();
    }


    /** PATCH /stock/adjust — ajuste de kilos/unidades con log de movimiento */
    @Patch('adjust')
    @Roles('SUPERVISOR', 'ADMIN')
    adjust(
        @CurrentUser() user: { id: string },
        @Body() body: {
            depositoId: string;
            posicionId: string;
            itemId: string;
            lotId: string;
            qtyPrincipal: number;
            qtySecundaria?: number | null;
            fecha: string;
            observaciones?: string | null;
        },
    ) {
        return this.service.adjust({ ...body, user });
    }

    /** POST /stock/move — mover kilos de posición A a posición B */
    @Post('move')
    move(
        @CurrentUser() user: { id: string },
        @Body() body: {
            depositoId: string;
            posicionIdOrigen: string;
            posicionIdDestino: string;
            itemId: string;
            lotId: string;
            qtyPrincipal: number;
            qtySecundaria?: number | null;
            fecha: string;
        },
    ) {
        return this.service.move({ ...body, user });
    }

    /** POST /stock/bulk-move — mover múltiples registros en una sola operación auditada */
    @Post('bulk-move')
    bulkMove(
        @CurrentUser() user: { id: string },
        @Body() body: {
            items: {
                depositoId: string;
                posicionIdOrigen: string;
                posicionIdDestino: string;
                itemId: string;
                lotId: string;
                qtyPrincipal: number;
                qtySecundaria?: number | null;
            }[];
            fecha: string;
            observaciones?: string;
        },
    ) {
        return this.service.bulkMove({ ...body, user });
    }

    /** POST /stock/quick-add — agrega un nuevo batch o stock balance en una posición específica */
    @Post('quick-add')
    @Roles('SUPERVISOR', 'ADMIN')
    quickAdd(
        @CurrentUser() user: { id: string },
        @Body() body: {
            depositoId: string;
            posicionId: string;
            itemId: string;
            supplierId: string;
            lotNumber: string;
            qtyPrincipal: number;
            qtySecundaria?: number | null;
            fecha: string;
        },
    ) {
        return this.service.quickAdd({ ...body, user });
    }

    /** DELETE /stock — elimina un registro de stock_balance (registra movimiento) */
    @Delete()
    @Roles('SUPERVISOR', 'ADMIN')
    deleteBalance(
        @CurrentUser() user: { id: string },
        @Body() body: {
            depositoId: string;
            posicionId: string;
            itemId: string;
            lotId: string;
            fecha: string;
        },
    ) {
        return this.service.deleteBalance({ ...body, user });
    }

    /** DELETE /stock/item/:itemId — elimina TODO el stock de un material (registra ajustes) */
    @Delete('item/:itemId')
    @Roles('ADMIN')
    deleteAllItemStock(
        @CurrentUser() user: { id: string },
        @Param('itemId') itemId: string,
        @Body() body: { fecha: string; observaciones?: string }
    ) {
        return this.service.deleteAllStockForItem({
            itemId: itemId,
            fecha: body.fecha || new Date().toISOString(),
            user: user,
            observaciones: body.observaciones
        });
    }

    /** PATCH /stock/reassign-batch — reasigna una partida con merge/create inteligente */
    @Patch('reassign-batch')
    @Roles('SUPERVISOR', 'ADMIN')
    reassignBatch(
        @CurrentUser() user: { id: string },
        @Body() body: {
            depositoId: string;
            posicionId: string;
            itemId: string;
            currentLotId: string;
            newLotNumber: string;
            fecha: string;
        },
    ) {
        return this.service.reassignBatch({ ...body, user });
    }

    /** GET /stock/check-batch — verifica si una partida existe */
    @Get('check-batch')
    checkBatch(
        @Query('itemId') itemId: string,
        @Query('lotNumber') lotNumber: string,
        @Query('supplierId') supplierId?: string,
    ) {
        return this.service.checkBatchExists(itemId, lotNumber, supplierId);
    }

    @Patch('batch/:id/observations')
    @Roles('SUPERVISOR', 'ADMIN')
    updateBatchObservations(
        @Param('id') id: string,
        @Body() body: { observaciones: string | null },
    ) {
        return this.service.updateBatchObservations(id, body.observaciones);
    }
}

@ApiTags('Warehouse/Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(
        private readonly service: StockService,
        private readonly dashboardService: DashboardService
    ) { }

    @Get('compras')
    @ApiOperation({ summary: 'Get purchasing dashboard' })
    getCompras(@CurrentUser() user: any) {
        return this.service.getDashboardCompras(user);
    }

    @Get('capacity')
    getCapacity(@CurrentUser() user: any) {
        return this.dashboardService.getCapacityByDepot(user);
    }

    @Get('alerts')
    getAlerts(@CurrentUser() user: any, @Query('all') all?: string) {
        return this.service.getAlerts(user, all === 'true' || all === '1');
    }

    @Get('capacity-timeline')
    getCapacityTimeline(@CurrentUser() user: any) {
        return this.dashboardService.getCapacityTimeline(user);
    }

    @Get('volumes')
    getVolumes(@CurrentUser() user: any) {
        return this.dashboardService.getVolumes(user);
    }
}
