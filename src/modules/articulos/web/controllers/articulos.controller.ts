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
import { ArticulosService, ArticulosFilterDto } from '../../application/services/articulos.service';
import { ArticuloEntity } from '../../infrastructure/persistence/entities/articulo.entity';

@Controller('articulos')
export class ArticulosController {
    constructor(private readonly articulosService: ArticulosService) { }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    findAll(
        @Query('search') search?: string,
        @Query('tipo') tipo?: string,
        @Query('etapa') etapa?: string,
        @Query('familia') familia?: string,
        @Query('modelo') modelo?: string,
        @Query('destino') destino?: string,
        @Query('estado') estado?: string,
        @Query('marca') marca?: string,
        @Query('talle') talle?: string,
        @Query('tipoArticulo') tipoArticulo?: string,
        @Query('estadoRevision') estadoRevision?: string,
        @Query('activo') activo?: string,
        @Query('soloConEtapa') soloConEtapa?: string,
        @Query('alerta') alerta?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const filters: ArticulosFilterDto = {
            search,
            tipo,
            etapa,
            familia,
            modelo,
            destino,
            estado,
            marca,
            talle,
            tipoArticulo,
            estadoRevision,
            activo: activo !== undefined ? activo === 'true' : undefined,
            soloConEtapa: soloConEtapa === 'true',
            alerta,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 25,
        };
        return this.articulosService.findAll(filters);
    }

    /**
     * Resumen de alertas para el panel superior de control
     * GET /articulos/alertas/resumen
     */
    @Get('alertas/resumen')
    @UseGuards(JwtAuthGuard, RolesGuard)
    getResumenAlertas() {
        return this.articulosService.getResumenAlertas();
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    findOne(@Param('id') id: string) {
        return this.articulosService.findOne(id);
    }

    @Get('codigo/:codigo')
    @UseGuards(JwtAuthGuard, RolesGuard)
    findByCodigo(@Param('codigo') codigo: string) {
        return this.articulosService.findByCodigo(codigo);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    create(@Body() dto: Partial<ArticuloEntity>) {
        return this.articulosService.create(dto);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    update(@Param('id') id: string, @Body() dto: Partial<ArticuloEntity>) {
        return this.articulosService.update(id, dto);
    }

    @Post('sincronizar-totvs')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    sincronizarTotvs(@Body('filePath') filePath?: string) {
        return this.articulosService.sincronizarDesdeTotvs(filePath);
    }

    /**
     * Endpoint protegido por clave para la sincronización masiva remota de artículos
     */
    @Post('seed-batch')
    async seedBatch(
        @Headers('x-seed-key') seedKey: string,
        @Body() body: { items: Array<Partial<ArticuloEntity>> },
    ) {
        if (seedKey !== 'totvs-seed-key-2026') {
            throw new UnauthorizedException('Clave de sincronización de seed inválida.');
        }
        return this.articulosService.seedBatchItems(body.items || []);
    }

    /**
     * Endpoint protegido por clave para la purga de tablas y columnas obsoletas (stg_, viejas de calidad)
     */
    @Post('cleanup-obsolete')
    async cleanupObsolete(@Headers('x-seed-key') seedKey: string) {
        if (seedKey !== 'totvs-seed-key-2026') {
            throw new UnauthorizedException('Clave de sincronización inválida.');
        }
        return this.articulosService.ejecutarLimpiezaHuerfanos();
    }

    /**
     * Obtiene artículos con su estado de asignación de máquinas
     */
    @Get('maquinas/resumen')
    @UseGuards(JwtAuthGuard, RolesGuard)
    getArticulosConMaquinas(
        @Query('search') search?: string,
        @Query('etapa') etapa?: string,
        @Query('familia') familia?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.articulosService.getArticulosConMaquinas({
            search,
            etapa,
            familia,
            status,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 25,
        });
    }

    /**
     * Obtiene catálogo de tipos de máquina (solo lectura de machine_types)
     */
    @Get('maquinas/catalogo')
    @UseGuards(JwtAuthGuard, RolesGuard)
    getAvailableMachineTypes(@Query('category') category?: string) {
        return this.articulosService.getAvailableMachineTypes(category);
    }

    /**
     * Obtiene los tipos de máquina y tiempos asignados a un artículo específico
     */
    @Get(':id/maquinas')
    @UseGuards(JwtAuthGuard, RolesGuard)
    getArticuloMachineTypes(@Param('id') id: string) {
        return this.articulosService.getArticuloMachineTypes(id);
    }

    /**
     * Actualiza o crea manualmente la relación de un artículo con un tipo de máquina
     */
    @Put(':id/maquinas/:machineTypeId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    updateArticuloMachineType(
        @Param('id') id: string,
        @Param('machineTypeId') machineTypeId: string,
        @Body() dto: { cycleTimeSeconds: number; status?: string; timeSource?: string; preferida?: boolean },
    ) {
        return this.articulosService.updateArticuloMachineType(id, machineTypeId, dto);
    }

    @Delete(':id/maquinas/:machineTypeId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('SUPERVISOR', 'ADMIN')
    deleteArticuloMachineType(
        @Param('id') id: string,
        @Param('machineTypeId') machineTypeId: string,
    ) {
        return this.articulosService.deleteArticuloMachineType(id, machineTypeId);
    }
}

