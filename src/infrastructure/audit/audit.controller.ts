import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
export class AuditController {
    constructor(private readonly service: AuditService) {}

    @Get()
    findAll(
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('actor') actor?: string,
        @Query('resource') resource?: string,
        @Query('action') action?: string,
        @Query('success') success?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.service.findAll({
            page: Number(page),
            pageSize: Number(pageSize),
            actor,
            resource,
            action,
            success: success === undefined ? undefined : success === 'true',
            from,
            to,
        });
    }
}
