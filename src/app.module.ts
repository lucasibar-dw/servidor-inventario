import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { AuthModule } from './infrastructure/auth/auth.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { ConfiguracionModule } from './modules/config/config.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { QualityModule } from './modules/quality/quality.module';
import { HrModule } from './modules/hr/hr.module';
import { AuditModule } from './infrastructure/audit/audit.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { ArticulosModule } from './modules/articulos/articulos.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { ProduccionModule } from './modules/produccion/produccion.module';
import { FinanceModule } from './modules/finance/finance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    PersistenceModule,
    AuthModule,
    MaintenanceModule,
    ConfiguracionModule,
    WarehouseModule,
    QualityModule,
    HrModule,
    FinanceModule,
    AuditModule,
    PurchasingModule,
    ArticulosModule,
    VentasModule,
    ProduccionModule,
  ],
})
export class AppModule { }
