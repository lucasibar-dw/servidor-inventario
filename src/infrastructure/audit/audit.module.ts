import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditLogEntity } from './audit-log.entity';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

@Module({
    imports: [TypeOrmModule.forFeature([AuditLogEntity])],
    controllers: [AuditController],
    providers: [
        AuditService,
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
    exports: [AuditService],
})
export class AuditModule {}
