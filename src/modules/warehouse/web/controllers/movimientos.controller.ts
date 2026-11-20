import { Controller, Get, Query, UseGuards, Post, Request, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { MovimientosService } from '../../application/services/movimientos.service';
import { TipoMovimiento } from '../../infrastructure/persistence/entities/movimiento.entity';

@Controller('movimientos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MovimientosController {
    constructor(private readonly movimientosService: MovimientosService) { }

    @Get()
    getAll(
        @Query('depositoId') depositoId?: string,
        @Query('posicionId') posicionId?: string,
        @Query('itemId') itemId?: string,
        @Query('lotNumber') lotNumber?: string,
        @Query('tipo') tipo?: TipoMovimiento,
        @Query('status') status?: string,
        @Query('userId') userId?: string,
        @Query('documentoNumero') documentoNumero?: string,
        @Query('q') q?: string,
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
        @Query('limit') limit?: string,
    ) {
        const parsedLimit = limit ? parseInt(limit, 10) : undefined;
        return this.movimientosService.findAll({
            depositoId,
            posicionId,
            itemId,
            lotNumber,
            tipo,
            status,
            userId,
            documentoNumero,
            q,
            desde,
            hasta,
            limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
        });
    }

    @Post(':id/cancel')
    @Roles('SUPERVISOR', 'ADMIN')
    cancel(@Param('id') id: string) {
        return this.movimientosService.cancelar(id);
    }
}
