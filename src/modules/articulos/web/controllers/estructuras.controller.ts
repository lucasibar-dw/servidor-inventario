import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Query,
    Body,
    Headers,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { EstructurasService } from '../../application/services/estructuras.service';
import { ArticuloEstructuraEntity } from '../../infrastructure/persistence/entities/articulo-estructura.entity';

@Controller('articulos/estructuras')
export class EstructurasController {
    constructor(private readonly estructurasService: EstructurasService) { }

    /**
     * Obtiene artículos pendientes de generación de ficha técnica / estructura (BOM)
     */
    @Get('pendientes')
    @UseGuards(JwtAuthGuard, RolesGuard)
    findPendientes(
        @Query('search') search?: string,
        @Query('tipo') tipo?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.estructurasService.findPendientesEstructura({
            search,
            tipo,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 20,
        });
    }

    /**
     * Asistente de creación de árbol de producto (PA -> PI -> Hilados/Materiales -> Depósito)
     */
    @Post('crear-arbol')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    crearArbol(
        @Body() body: {
            codigoPadre: string;
            productoIntermedio?: {
                codigoPI: string;
                descripcionPI?: string;
                cantidad?: number;
            };
            componentes: Array<{
                codigoComponente: string;
                descripcionInsumo?: string;
                cantidad: number;
                tipoFijoVariable?: string;
                itemIdEquivalente?: string;
                ordenPrioridad?: number;
            }>;
        },
    ) {
        return this.estructurasService.guardarEstructuraArbol(body);
    }

    @Get(':codigoPadre')
    @UseGuards(JwtAuthGuard, RolesGuard)
    findByPadre(@Param('codigoPadre') codigoPadre: string) {
        return this.estructurasService.findByPadre(codigoPadre);
    }

    @Get(':codigoPadre/explosion')
    @UseGuards(JwtAuthGuard, RolesGuard)
    explotar(
        @Param('codigoPadre') codigoPadre: string,
        @Query('cantidad') cantidad?: string,
    ) {
        const cant = cantidad ? Number(cantidad) : 1;
        return this.estructurasService.explotarEstructura(codigoPadre, cant);
    }

    @Get(':codigoPadre/simular')
    @UseGuards(JwtAuthGuard, RolesGuard)
    simular(
        @Param('codigoPadre') codigoPadre: string,
        @Query('cantidad') cantidad?: string,
    ) {
        const cant = cantidad ? Number(cantidad) : 1;
        return this.estructurasService.simularNecesidades(codigoPadre, cant);
    }

    @Post('linea')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    upsertLinea(
        @Body() body: {
            codigoPadre: string;
            codigoComponente: string;
            cantidad: number;
            cantidadSecundaria?: number | null;
            observacion?: string | null;
        },
    ) {
        return this.estructurasService.upsertLineaEstructura(body);
    }

    @Post(':codigoPadre/componente')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    upsertComponente(
        @Param('codigoPadre') codigoPadre: string,
        @Body() body: {
            codigoComponente: string;
            cantidad: number;
            cantidadSecundaria?: number | null;
            observacion?: string | null;
        },
    ) {
        return this.estructurasService.upsertLineaEstructura({
            codigoPadre,
            ...body,
        });
    }

    @Delete('linea/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    eliminarLinea(@Param('id') id: string) {
        return this.estructurasService.eliminarLineaEstructura(id);
    }

    /**
     * Endpoint protegido por clave para la sincronización masiva remota de estructuras
     */
    @Post('seed-batch')
    async seedBatch(
        @Headers('x-seed-key') seedKey: string,
        @Body() body: { items: Array<Partial<ArticuloEstructuraEntity>> },
    ) {
        if (seedKey !== 'totvs-seed-key-2026') {
            throw new UnauthorizedException('Clave de sincronización inválida.');
        }
        return this.estructurasService.seedBatch(body.items || []);
    }
}
