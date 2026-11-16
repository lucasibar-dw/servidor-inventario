import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { PartnersService } from '../../application/services/partners.service';
import { PartnerType } from '../../infrastructure/persistence/entities/partner.entity';

@Controller('partners')
@UseGuards(JwtAuthGuard)
export class PartnersController {
    constructor(private readonly service: PartnersService) { }

    @Get()
    findAll(@Query('type') type?: string, @Query('q') q?: string) {
        return this.service.findAll(type, q);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() dto: {
        name: string;
        type?: PartnerType;
        taxId?: string;
        email?: string;
        phone?: string;
        address?: string;
    }) {
        return this.service.create(dto);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: any) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
