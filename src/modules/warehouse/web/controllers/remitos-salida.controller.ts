import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../infrastructure/auth/guards/roles.guard';
import { Roles } from '../../../../infrastructure/auth/decorators/roles.decorator';
import { Sectors } from '../../../../infrastructure/auth/decorators/sectors.decorator';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import { RemitoSalidaService, CreateRemitoSalidaDto, RemitoSalidaLineInput } from '../../application/services/remito-salida.service';

@Controller('remitos-salida')
@UseGuards(JwtAuthGuard, RolesGuard)
@Sectors('DEPOSITO', 'COMPRAS')
export class RemitosSalidaController {
    constructor(private readonly service: RemitoSalidaService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post('preview')
    preview(@Body() dto: { lines: RemitoSalidaLineInput[] }) {
        return this.service.preview(dto.lines);
    }

    @Post()
    create(
        @CurrentUser() user: { id: string },
        @Body() dto: CreateRemitoSalidaDto,
    ) {
        return this.service.create({ ...dto, userId: user.id });
    }

    @Post('despacho-directo')
    despachoDirecto(
        @CurrentUser() user: { id: string },
        @Body() dto: {
            fecha: string;
            clientId?: string;
            clientName?: string;
            depositoId: string;
            posicionId: string;
            itemId: string;
            lotId: string;
            qtyPrincipal: number;
            qtySecundaria?: number;
        },
    ) {
        return this.service.despachoDirecto({ ...dto, userId: user.id });
    }

    @Delete(':id')
    @Roles('ADMIN', 'SUPERVISOR')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    @Delete('line/:movementId')
    @Roles('ADMIN', 'SUPERVISOR')
    removeLine(@Param('movementId') movementId: string) {
        return this.service.removeLine(movementId);
    }
}
