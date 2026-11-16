import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import {
    ArticuloItemEquivalenciasService,
    AsociarItemDto,
    MaestroEquivalenciasFilterDto,
} from '../../application/services/articulo-item-equivalencias.service';

@Controller('articulos')
export class ArticuloItemEquivalenciasController {
    constructor(
        private readonly equivalenciasService: ArticuloItemEquivalenciasService,
    ) { }

    /**
     * Listado maestro para pantalla Master-Detail de Artículos con estado de mapeo
     * GET /articulos/equivalencias/maestro?search=&tipo=MP&soloSinMapear=true&page=1&limit=25
     */
    @Get('equivalencias/maestro')
    @UseGuards(JwtAuthGuard, RolesGuard)
    async listarMaestro(
        @Query('search') search?: string,
        @Query('tipo') tipo?: string,
        @Query('etapa') etapa?: string,
        @Query('soloSinMapear') soloSinMapear?: string,
        @Query('soloMapeados') soloMapeados?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const filters: MaestroEquivalenciasFilterDto = {
            search,
            tipo,
            etapa,
            soloSinMapear: soloSinMapear === 'true',
            soloMapeados: soloMapeados === 'true',
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 25,
        };
        return this.equivalenciasService.listarMaestro(filters);
    }

    /**
     * Obtiene los ítems vinculados a un artículo con orden de prioridad y stock físico en tiempo real
     * GET /articulos/:articuloId/equivalencias
     */
    @Get(':articuloId/equivalencias')
    @UseGuards(JwtAuthGuard, RolesGuard)
    async findByArticulo(@Param('articuloId') articuloId: string) {
        return this.equivalenciasService.findByArticulo(articuloId);
    }

    /**
     * Asocia un ítem de inventario a un artículo de TOTVS asignándole prioridad
     * POST /articulos/:articuloId/equivalencias
     */
    @Post(':articuloId/equivalencias')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    async asociarItem(
        @Param('articuloId') articuloId: string,
        @Body() body: { itemId: string; ordenPrioridad?: number; factorConversion?: number; observaciones?: string },
    ) {
        const dto: AsociarItemDto = {
            articuloId,
            itemId: body.itemId,
            ordenPrioridad: body.ordenPrioridad,
            factorConversion: body.factorConversion,
            observaciones: body.observaciones,
        };
        return this.equivalenciasService.asociarItem(dto);
    }

    /**
     * Reordena la prioridad de los ítems de un artículo
     * PUT /articulos/:articuloId/equivalencias/orden
     * Body: { equivalenciaIds: ["uuid-1", "uuid-2", "uuid-3"] }
     */
    @Put(':articuloId/equivalencias/orden')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    async reordenarPrioridades(
        @Param('articuloId') articuloId: string,
        @Body('equivalenciaIds') equivalenciaIds: string[],
    ) {
        return this.equivalenciasService.reordenarPrioridades(articuloId, equivalenciaIds || []);
    }

    /**
     * Elimina el vínculo de un ítem con un artículo y renombra las prioridades restantes
     * DELETE /articulos/equivalencias/:id
     */
    @Delete('equivalencias/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    async desasociarItem(@Param('id') id: string) {
        return this.equivalenciasService.desasociarItem(id);
    }

    /**
     * Ejecuta el matching automático entre Artículos MP e Ítems del sistema
     * POST /articulos/equivalencias/auto-match
     */
    @Post('equivalencias/auto-match')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async autoSugerirYVincular() {
        return this.equivalenciasService.autoSugerirYVincular();
    }

    /**
     * Endpoint protegido por clave para la carga masiva y sincronización de equivalencias
     * POST /articulos/equivalencias/seed-batch
     */
    @Post('equivalencias/seed-batch')
    async seedBatch(
        @Headers('x-seed-key') seedKey: string,
        @Body() body: {
            items: Array<{
                articuloCodigo: string;
                itemCodigo?: string;
                itemId?: string;
                ordenPrioridad?: number;
                factorConversion?: number;
                observaciones?: string;
            }>;
        },
    ) {
        if (seedKey !== 'totvs-seed-key-2026') {
            throw new UnauthorizedException('Clave de sincronización de seed inválida.');
        }
        return this.equivalenciasService.seedBatchEquivalencias(body.items || []);
    }
}
