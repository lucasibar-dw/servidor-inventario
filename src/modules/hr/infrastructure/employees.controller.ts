import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../infrastructure/auth/guards/jwt-auth.guard';
import { EmployeesService } from '../application/employees.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/employees')
export class EmployeesController {
    constructor(private readonly employeesService: EmployeesService) {}

    @Get('metrics')
    getMetrics() {
        return this.employeesService.getMetrics();
    }

    @Get('productivity')
    getProductivity(
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('shift') shift?: string,
        @Query('legajo') legajo?: string,
    ) {
        return this.employeesService.getProductivity({ from, to, shift, legajo });
    }

    @Get()
    findAll(
        @Query('q') q?: string,
        @Query('active') active?: string,
        @Query('sector') sector?: string,
    ) {
        return this.employeesService.findAll({
            q,
            active: active === undefined ? undefined : active === 'true',
            sector,
        });
    }

    @Get(':id')
    findById(@Param('id') id: string) {
        return this.employeesService.findById(id);
    }

    @Post()
    create(@Body() dto: { legajo: string; fullName?: string; primarySectorCode?: string; sector?: string; subSector?: string; active?: boolean; source?: string }) {
        return this.employeesService.create(dto);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: { legajo?: string; fullName?: string; primarySectorCode?: string; sector?: string; subSector?: string; active?: boolean },
    ) {
        return this.employeesService.update(id, dto);
    }

    @Patch(':id/toggle')
    toggleActive(@Param('id') id: string) {
        return this.employeesService.toggleActive(id);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.employeesService.delete(id);
    }
}
