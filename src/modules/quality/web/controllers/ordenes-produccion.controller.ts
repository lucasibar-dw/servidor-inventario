import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    UseInterceptors,
    UploadedFiles,
    UseGuards,
    BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Sectors } from '../../../../infrastructure/auth/decorators/sectors.decorator';
import { OrdenesProduccionService, ProduccionParseResult } from '../../application/services/ordenes-produccion.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Sectors('PRODUCCION', 'DEPOSITO', 'COMPRAS', 'DESARROLLO', 'CALIDAD')
@Controller('articulos/ordenes-produccion')
export class OrdenesProduccionController {
    constructor(private readonly service: OrdenesProduccionService) {}

    @Post('parse')
    @UseInterceptors(
        FilesInterceptor('files', 50, {
            storage: memoryStorage(),
            limits: { fileSize: 25 * 1024 * 1024 },
            fileFilter: (req, file, cb) => {
                if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException('Solo se permiten archivos PDF de órdenes de producción'), false);
                }
            },
        }),
    )
    async parseOrdenes(
        @UploadedFiles() files: Array<Express.Multer.File>,
        @Body('plantaId') plantaId?: string,
        @Body('sector') sector?: string,
        @Body('fechaFiltro') fechaFiltro?: string,
    ): Promise<ProduccionParseResult> {
        if (!files || files.length === 0) {
            throw new BadRequestException('Debes subir al menos un archivo PDF de orden de producción.');
        }

        const filesData = files.map((f) => ({
            buffer: f.buffer,
            originalname: f.originalname,
        }));

        return this.service.parseOrdenesFromBuffers(filesData, {
            plantaId,
            sector,
            fechaFiltro,
        });
    }

    @Get('ultima')
    async getUltimaPlanilla(
        @Query('plantaId') plantaId?: string,
        @Query('sector') sector?: string,
    ): Promise<ProduccionParseResult | null> {
        return this.service.getUltimaPlanilla(plantaId, sector);
    }

    @Post('recalcular')
    async recalcularUltimaPlanilla(
        @Body('plantaId') plantaId?: string,
        @Body('sector') sector?: string,
    ): Promise<ProduccionParseResult | null> {
        return this.service.recalcularPlanilla(undefined, plantaId, sector);
    }

    @Post('planillas/:id/recalcular')
    async recalcularPlanilla(
        @Param('id') id: string,
        @Body('plantaId') plantaId?: string,
        @Body('sector') sector?: string,
    ): Promise<ProduccionParseResult | null> {
        return this.service.recalcularPlanilla(id, plantaId, sector);
    }

    @Post('vincular-susi')
    async vincularCodigoSusana(
        @Body()
        dto: {
            codigoSusana: string;
            articuloId: string;
            planillaId?: string;
            plantaId?: string;
            sector?: string;
        },
    ): Promise<ProduccionParseResult | null> {
        try {
            return await this.service.vincularCodigoSusana(dto);
        } catch (err: any) {
            throw new BadRequestException(err.message || 'No se pudo vincular el código de Susana.');
        }
    }

    @Patch('cambio-hora')
    async actualizarHoraCambio(
        @Body()
        dto: {
            fecha: string;
            maquina: number;
            turno: string;
            hora: string;
            planillaId?: string;
            plantaId?: string;
            sector?: string;
        },
    ): Promise<ProduccionParseResult | null> {
        return this.service.actualizarHoraCambio(dto);
    }

    @Get('catalogo-matcheo')
    async getCatalogoParaMatcheo(
        @Query('search') search?: string,
        @Query('etapa') etapa?: string,
    ) {
        return this.service.getCatalogoParaMatcheo(search, etapa);
    }

    @Get('planillas')
    async listarPlanillas() {
        return this.service.listarPlanillas();
    }

    @Get('corte-proveedor')
    async getCorteProveedor(
        @Query('categoria') categoria?: string,
        @Query('meses') meses?: string,
    ) {
        return this.service.getCorteProveedor(categoria, meses ? Number(meses) : 3);
    }

    @Get('planillas/:id')
    async getPlanillaById(@Param('id') id: string): Promise<ProduccionParseResult | null> {
        return this.service.getPlanillaById(id);
    }

    @Delete('planillas')
    async limpiarPlanillas() {
        return this.service.limpiarPlanillas();
    }

    @Delete('planillas/:id')
    async eliminarPlanilla(@Param('id') id: string) {
        return this.service.eliminarPlanilla(id);
    }

    @Get('depositos-articulos')
    async getDepositosArticulos() {
        return this.service.getDepositosArticulos();
    }

    @Post('posiciones-articulos')
    async crearPosicionArticulo(@Body() dto: any) {
        return this.service.crearPosicionArticulo(dto);
    }

    @Get('pedidos')
    async listarPedidosProduccion() {
        return this.service.listarPedidosProduccion();
    }

    @Post('pedidos')
    async crearPedidoProduccion(@Body() dto: any) {
        return this.service.crearPedidoProduccion(dto);
    }

    @Patch('pedidos/:id')
    async actualizarPedidoProduccion(@Param('id') id: string, @Body() dto: any) {
        return this.service.actualizarPedidoProduccion(id, dto);
    }

    @Post('pedidos/sincronizar')
    async sincronizarPlanillaConPedidos() {
        return this.service.sincronizarPlanillaConPedidos();
    }
}
