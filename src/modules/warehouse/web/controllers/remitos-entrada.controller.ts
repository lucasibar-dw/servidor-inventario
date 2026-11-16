import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { Sectors } from '../../../../infrastructure/auth/decorators/sectors.decorator';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import { RemitoEntradaService, CreateRemitoEntradaDto } from '../../application/services/remito-entrada.service';

@Controller('remitos-entrada')
@UseGuards(JwtAuthGuard, RolesGuard)
@Sectors('DEPOSITO', 'COMPRAS')
export class RemitosEntradaController {
    constructor(private readonly service: RemitoEntradaService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post()
    create(
        @CurrentUser() user: { id: string },
        @Body() dto: CreateRemitoEntradaDto,
    ) {
        return this.service.create({ ...dto, userId: user.id });
    }

    @Delete('line/:movementId')
    @Roles('ADMIN', 'SUPERVISOR')
    removeLine(@Param('movementId') movementId: string) {
        return this.service.removeLine(movementId);
    }

    @Delete(':id')
    @Roles('ADMIN', 'SUPERVISOR')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
