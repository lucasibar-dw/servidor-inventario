import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ProgramacionService,
    AsignarBloqueDto,
    MoverBloqueDto,
    SplitBloqueDto,
    GenerarPlanIdealDto,
    PromoverPlanDto,
} from '../../application/services/programacion.service';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';

@Controller('produccion/programacion')
@UseGuards(JwtAuthGuard)
export class ProgramacionController {
    constructor(private readonly programacionService: ProgramacionService) { }

    @Get('timeline')
    async getTimeline(
        @Query('desde') desde: string,
        @Query('hasta') hasta: string,
        @Query('tipoPlan') tipoPlan?: 'REAL' | 'IDEAL',
    ) {
        const defaultDesde = desde || new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
        const defaultHasta = hasta || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        return this.programacionService.getTimeline(defaultDesde, defaultHasta, tipoPlan || 'REAL');
    }

    @Get('backlog')
    async getBacklog(
        @Query('cliente') cliente?: string,
        @Query('search') search?: string,
    ) {
        return this.programacionService.getBacklog(cliente, search);
    }

    @Post('asignar')
    async asignarBloque(@Body() dto: AsignarBloqueDto) {
        return this.programacionService.asignarBloque(dto);
    }

    @Patch(':id/mover')
    async moverBloque(
        @Param('id') id: string,
        @Body() dto: MoverBloqueDto,
    ) {
        return this.programacionService.moverBloque(id, dto);
    }

    @Post(':id/split')
    async splitBloque(
        @Param('id') id: string,
        @Body() dto: SplitBloqueDto,
    ) {
        return this.programacionService.splitBloque(id, dto);
    }

    @Delete(':id')
    async eliminarBloque(@Param('id') id: string) {
        return this.programacionService.eliminarBloque(id);
    }

    @Patch(':id/estado')
    async actualizarEstado(
        @Param('id') id: string,
        @Body('estado') estado: string,
    ) {
        return this.programacionService.actualizarEstado(id, estado);
    }

    @Post('generar-ideal')
    async generarPlanIdeal(@Body() dto: GenerarPlanIdealDto) {
        return this.programacionService.generarPlanIdeal(dto);
    }

    @Post('promover-ideal')
    async promoverPlanIdeal(@Body() dto: PromoverPlanDto) {
        return this.programacionService.promoverPlanIdeal(dto);
    }
}
