import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import {
    VentasService,
    FiltrosPedidosDto,
    CrearPedidoDto,
    AvanceEstadioDto,
    EmitirRemitoDto,
} from '../../application/services/ventas.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ventas')
export class VentasController {
    constructor(private readonly ventasService: VentasService) { }

    @Get('pedidos')
    async listarPedidos(
        @Query('cliente') cliente?: string,
        @Query('estado') estado?: string,
        @Query('search') search?: string,
        @Query('soloPendientes') soloPendientes?: string,
        @Query('soloSinEstructura') soloSinEstructura?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const filtros: FiltrosPedidosDto = {
            cliente,
            estado,
            search,
            soloPendientes: soloPendientes === 'true',
            soloSinEstructura: soloSinEstructura === 'true',
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 50,
        };
        return this.ventasService.listarPedidos(filtros);
    }

    @Get('pedidos/:id')
    async obtenerPedidoPorId(@Param('id') id: string) {
        return this.ventasService.obtenerPedidoPorId(id);
    }

    @Post('pedidos')
    async crearPedido(@Body() dto: CrearPedidoDto) {
        return this.ventasService.crearPedido(dto);
    }

    @Patch('pedidos/:id/avance')
    async registrarAvanceEstadio(
        @Param('id') id: string,
        @Body() dto: AvanceEstadioDto,
    ) {
        return this.ventasService.registrarAvanceEstadio(id, dto);
    }

    @Patch('pedidos/:id/remito')
    async emitirRemitoSalida(
        @Param('id') id: string,
        @Body() dto: EmitirRemitoDto,
    ) {
        return this.ventasService.emitirRemitoSalida(id, dto);
    }

    @Post('importar-excel')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: 40 * 1024 * 1024 },
        }),
    )
    async importarExcel(
        @UploadedFile() file?: Express.Multer.File,
        @Body('filePath') filePath?: string,
    ) {
        return this.ventasService.importarDesdeConsolidado(file?.buffer, filePath);
    }

    @Get('articulos-sin-estructura')
    async listarArticulosSinEstructura() {
        return this.ventasService.listarArticulosSinEstructura();
    }

    @Get('movimientos')
    async listarMovimientos(
        @Query('pedidoId') pedidoId?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.ventasService.listarMovimientos({
            pedidoId,
            search,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 50,
        });
    }
}
