import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import {
    BalanceStockArticulosService,
    StockArticulosFilterDto,
} from '../../application/services/balance-stock-articulos.service';

@Controller('articulos/stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BalanceStockArticulosController {
    constructor(private readonly stockService: BalanceStockArticulosService) { }

    @Get()
    findAll(
        @Query('deposito') deposito?: string,
        @Query('search') search?: string,
        @Query('tipo') tipo?: string,
        @Query('marca') marca?: string,
        @Query('talle') talle?: string,
        @Query('soloConStock') soloConStock?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const filters: StockArticulosFilterDto = {
            deposito,
            search,
            tipo,
            marca,
            talle,
            soloConStock: soloConStock === 'true',
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 25,
        };
        return this.stockService.findAll(filters);
    }

    @Get('resumen')
    getResumen() {
        return this.stockService.getResumenKpis();
    }

    @Get(':articuloId')
    findByArticulo(@Param('articuloId') articuloId: string) {
        return this.stockService.findByArticulo(articuloId);
    }
}
