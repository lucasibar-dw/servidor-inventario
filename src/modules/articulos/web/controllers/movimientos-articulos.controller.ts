import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import {
    MovimientosArticulosService,
    RegistrarMovimientoArticuloDto,
    MovimientosArticulosFilterDto,
} from '../../application/services/movimientos-articulos.service';
import {
    TipoMovimientoArticulo,
    MovimientoArticuloStatus,
} from '../../infrastructure/persistence/entities/movimiento-articulo.entity';

@Controller('articulos/movimientos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MovimientosArticulosController {
    constructor(private readonly movimientosService: MovimientosArticulosService) { }

    @Get()
    findAll(
        @Query('articuloId') articuloId?: string,
        @Query('codigoArticulo') codigoArticulo?: string,
        @Query('tipo') tipo?: TipoMovimientoArticulo,
        @Query('deposito') deposito?: string,
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
        @Query('documentoReferencia') documentoReferencia?: string,
        @Query('status') status?: MovimientoArticuloStatus,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const filters: MovimientosArticulosFilterDto = {
            articuloId,
            codigoArticulo,
            tipo,
            deposito,
            desde,
            hasta,
            documentoReferencia,
            status,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 25,
        };
        return this.movimientosService.findAll(filters);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.movimientosService.findOne(id);
    }

    @Post()
    registrar(
        @CurrentUser() user: any,
        @Body()
        dto: {
            articuloId: string;
            tipo: TipoMovimientoArticulo;
            cantidad: number;
            deposito?: string;
            lote?: string;
            documentoReferencia?: string;
            observaciones?: string;
            fecha?: string;
        },
    ) {
        const payload: RegistrarMovimientoArticuloDto = {
            ...dto,
            userId: user?.id || user?.sub || null,
        };
        return this.movimientosService.registrar(payload);
    }

    @Post(':id/anular')
    @Roles('SUPERVISOR', 'ADMIN')
    anular(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body('motivo') motivo?: string,
    ) {
        const userId = user?.id || user?.sub || null;
        return this.movimientosService.anular(id, userId, motivo);
    }
}
