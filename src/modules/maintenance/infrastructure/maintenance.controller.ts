import { Controller, Get, Post, Body, Param, Query, Patch, Delete, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../infrastructure/auth/guards/jwt-auth.guard';

import { MaintenanceService } from '../application/maintenance.service';
import { MachineStatus } from '../domain/entities/machine.entity';
import { ChangeType } from '../domain/entities/machine-change.entity';

@UseGuards(JwtAuthGuard)
@Controller('maintenance')
export class MaintenanceController {
    constructor(private readonly maintenanceService: MaintenanceService) { }

    @Get('plants')
    getPlants() {
        return this.maintenanceService.getPlants();
    }

    @Get('types')
    getMachineTypes(@Query('detailed') detailed?: string) {
        return this.maintenanceService.getMachineTypes(detailed === 'true');
    }

    @Get('availability-dashboard')
    getAvailabilityDashboard(
        @Query('plantId') plantId: string,
        @Query('typeId') typeId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.maintenanceService.getAvailabilityDashboard({
            plantId,
            typeId,
            startDate,
            endDate
        });
    }

    @Get('availability-timeline')
    getAvailabilityTimeline(
        @Query('plantId') plantId: string,
        @Query('typeId') typeId?: string,
        @Query('period') period?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.maintenanceService.getAvailabilityTimeline({
            plantId,
            typeId,
            period,
            startDate,
            endDate
        });
    }

    @Get('machines')
    getMachines(
        @Query('plantId') plantId?: string,
        @Query('typeId') typeId?: string
    ) {
        return this.maintenanceService.getMachines(plantId, typeId);
    }

    @Get('machines/:id/metrics')
    getMachineKPIs(
        @Param('id') id: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string
    ) {
        return this.maintenanceService.getMachineKPIs(
            id, 
            startDate ? new Date(`${startDate}T00:00:00.000-03:00`) : undefined, 
            endDate ? new Date(`${endDate}T23:59:59.999-03:00`) : undefined
        );
    }

    @Get('metrics')
    getGeneralMetrics(
        @Query('plantId') plantId: string,
        @Query('typeId') typeId?: string
    ) {
        return this.maintenanceService.getMetrics(plantId, typeId);
    }

    @Get('plants/:plantId/kpis')
    getPlantKPIs(
        @Param('plantId') plantId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('typeId') typeId?: string
    ) {
        return this.maintenanceService.getPlantKPIs(
            plantId,
            startDate ? new Date(`${startDate}T00:00:00.000-03:00`) : undefined,
            endDate ? new Date(`${endDate}T23:59:59.999-03:00`) : undefined,
            typeId
        );
    }

    @Post('machines/:id/status')
    updateStatus(
        @Param('id') id: string,
        @Body() dto: {
            status: MachineStatus;
            observation?: string;
            generatedBy: string;
            failureType?: string;
            timestamp?: string;
            isBatch?: boolean;
        }
    ) {
        return this.maintenanceService.updateMachineStatus(id, dto);
    }

    @Get('logs')
    getLogs(
        @Query('plantId') plantId?: string,
        @Query('machineId') machineId?: string,
        @Query('machineNumber') machineNumber?: string,
        @Query('status') status?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('simplified') simplified?: string
    ) {
        return this.maintenanceService.findAllLogs({ plantId, machineId, machineNumber, status, startDate, endDate, simplified: simplified === 'true' });
    }

    @Patch('logs/:id')
    updateLog(
        @Param('id') id: string,
        @Body() dto: { observation?: string; failureType?: string; toStatus?: string; generatedBy?: string; timestamp?: string }
    ) {
        return this.maintenanceService.updateLog(id, dto);
    }

    @Delete('logs/:id')
    deleteLog(@Param('id') id: string) {
        return this.maintenanceService.deleteLog(id);
    }

    @Get('stats')
    getStats(
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Query('startTime') startTime?: string,
        @Query('endTime') endTime?: string,
        @Query('plantId') plantId?: string
    ) {
        return this.maintenanceService.getMaintenanceStats({ startDate, endDate, startTime, endTime, plantId });
    }

    // ===== MACHINE CHANGES =====

    @Post('machine-changes')
    createMachineChange(
        @Body() dto: {
            machineId: string;
            changeTypes: string[];
            startTime: string;
            endTime?: string | null;
            observation?: string;
            generatedBy: string;
        }
    ) {
        return this.maintenanceService.createMachineChange(dto);
    }

    @Post('machine-changes/bulk')
    createMachineChangesBulk(
        @Body() body: {
            items: Array<{
                machineId: string;
                changeTypes: string[];
                startTime: string;
                endTime?: string | null;
                observation?: string;
                generatedBy: string;
            }>;
        }
    ) {
        return this.maintenanceService.createMachineChangesBulk(body.items);
    }

    @Get('machine-changes/report')
    getMachineChangeReport(
        @Query('plantId') plantId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('typeId') typeId?: string
    ) {
        return this.maintenanceService.getMachineChangeReport({ plantId, startDate, endDate, typeId });
    }

    @Get('machine-changes')
    getMachineChanges(
        @Query('plantId') plantId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('machineNumber') machineNumber?: string,
        @Query('changeType') changeType?: string,
        @Query('generatedBy') generatedBy?: string,
        @Query('search') search?: string
    ) {
        return this.maintenanceService.getMachineChanges({ plantId, startDate, endDate, machineNumber, changeType, generatedBy, search });
    }

    @Patch('machine-changes/:id')
    updateMachineChange(
        @Param('id') id: string,
        @Body() dto: {
            machineId?: string;
            changeTypes?: string[];
            startTime?: string;
            endTime?: string | null;
            observation?: string;
            generatedBy?: string;
        }
    ) {
        return this.maintenanceService.updateMachineChange(id, dto);
    }

    @Delete('machine-changes/:id')
    deleteMachineChange(@Param('id') id: string) {
        return this.maintenanceService.deleteMachineChange(id);
    }
}
