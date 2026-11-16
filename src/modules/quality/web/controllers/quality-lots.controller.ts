import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { Sectors } from '../../../../infrastructure/auth/decorators/sectors.decorator';
import { BatchQualityStatus } from '../../../warehouse/infrastructure/persistence/entities/batch.entity';
import { QualityLotsService } from '../../application/services/quality-lots.service';

@Controller('quality/lots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Sectors('CALIDAD', 'DEPOSITO')
export class QualityLotsController {
    constructor(private readonly service: QualityLotsService) {}

    @Get('config')
    getConfig() {
        return this.service.getConfig();
    }

    @Patch('config')
    @Roles('ADMIN', 'SUPERVISOR')
    @Sectors('CALIDAD')
    setConfig(@Body() body: { enabled: boolean }) {
        if (typeof body?.enabled !== 'boolean') {
            throw new BadRequestException('El campo "enabled" debe ser booleano.');
        }
        return this.service.setConfig(body.enabled);
    }

    @Post('release-all')
    @Roles('ADMIN', 'SUPERVISOR')
    @Sectors('CALIDAD')
    releaseAll(@Request() request: any) {
        return this.service.releaseAll(request.user?.username ?? request.user?.id ?? 'Usuario');
    }

    @Get()
    findAll(
        @Request() request: any,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('status') status?: BatchQualityStatus,
        @Query('q') q?: string,
        @Query('depositoId') depositoId?: string,
    ) {
        if (status && !Object.values(BatchQualityStatus).includes(status)) throw new BadRequestException('Estado de Calidad inválido.');
        return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), status, q, depositoId }, request.user);
    }

    @Patch(':id/release')
    @Roles('ADMIN', 'SUPERVISOR', 'OPERARIO')
    @Sectors('CALIDAD')
    release(@Param('id') id: string, @Body() body: { notes?: string | null }, @Request() request: any) {
        return this.service.release(id, request.user?.username ?? request.user?.id ?? 'Usuario', body.notes);
    }
}
