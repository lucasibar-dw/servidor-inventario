import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotEntity, PositionEntity } from './infrastructure/persistence/entities/depot.entity';
import { StockBalanceEntity } from './infrastructure/persistence/entities/stock-balance.entity';
import { MovimientoEntity } from './infrastructure/persistence/entities/movimiento.entity';
import { BatchEntity } from './infrastructure/persistence/entities/batch.entity';
import { TaskPersistenceEntity } from './infrastructure/persistence/entities/task.entity';
import { TaskTypeCatalogEntity } from './infrastructure/persistence/entities/task-type-catalog.entity';
import { DocumentoEntity } from './infrastructure/persistence/entities/documento.entity';
import { ItemEntity } from '../config/infrastructure/persistence/entities/item.entity';
import { PartnerEntity } from '../config/infrastructure/persistence/entities/partner.entity';
import { InventoryCheckEntity, InventoryCheckItemEntity } from './infrastructure/persistence/entities/inventory-check.entity';
import { EmployeeEntity } from '../hr/domain/entities/employee.entity';
import { ConfiguracionModule } from '../config/config.module';

import { StockService } from './application/services/stock.service';
import { DepotsService } from './application/services/depots.service';
import { MovimientosService } from './application/services/movimientos.service';
import { RemitoEntradaService } from './application/services/remito-entrada.service';
import { RemitoSalidaService } from './application/services/remito-salida.service';
import { TasksService } from './application/services/tasks.service';
import { DashboardService } from './application/services/dashboard.service';
import { InventoryCheckService } from './application/services/inventory-check.service';
import { MaterialAnalysisService } from './application/services/material-analysis.service';

import { StockController, DashboardController } from './web/controllers/stock.controller';
import { DepotsController, PositionsController } from './web/controllers/depots.controller';
import { MovimientosController } from './web/controllers/movimientos.controller';
import { RemitosEntradaController } from './web/controllers/remitos-entrada.controller';
import { RemitosSalidaController } from './web/controllers/remitos-salida.controller';
import { TasksController } from './web/controllers/tasks.controller';
import { InventoryCheckController } from './web/controllers/inventory-check.controller';
import { MaterialAnalysisController } from './web/controllers/material-analysis.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DepotEntity,
      PositionEntity,
      StockBalanceEntity,
      MovimientoEntity,
      BatchEntity,
      TaskPersistenceEntity,
      TaskTypeCatalogEntity,
      DocumentoEntity,
      ItemEntity,
      PartnerEntity,
      InventoryCheckEntity,
      InventoryCheckItemEntity,
      EmployeeEntity,
    ]),
    ConfiguracionModule,
  ],
  controllers: [
    StockController,
    DashboardController,
    DepotsController,
    PositionsController,
    MovimientosController,
    RemitosEntradaController,
    RemitosSalidaController,
    TasksController,
    InventoryCheckController,
    MaterialAnalysisController,
  ],
  providers: [
    StockService,
    DepotsService,
    MovimientosService,
    RemitoEntradaService,
    RemitoSalidaService,
    TasksService,
    DashboardService,
    InventoryCheckService,
    MaterialAnalysisService,
  ],
  exports: [
    StockService,
    DepotsService,
    MovimientosService,
    RemitoEntradaService,
    RemitoSalidaService,
    TasksService,
    DashboardService,
    InventoryCheckService,
  ],
})
export class WarehouseModule {}
