import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemEntity } from '../config/infrastructure/persistence/entities/item.entity';
import { PartnerEntity } from '../config/infrastructure/persistence/entities/partner.entity';
import { MachineTypeEntity } from '../maintenance/domain/entities/machine-type.entity';
import { OrdenesProduccionService } from './application/services/ordenes-produccion.service';
import { OrdenesProduccionController } from './web/controllers/ordenes-produccion.controller';
import { BatchEntity } from '../warehouse/infrastructure/persistence/entities/batch.entity';
import { StockBalanceEntity } from '../warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { QualityLotsService } from './application/services/quality-lots.service';
import { QualityLotsController } from './web/controllers/quality-lots.controller';
import { ConfiguracionModule } from '../config/config.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ItemEntity,
            PartnerEntity,
            MachineTypeEntity,
            BatchEntity,
            StockBalanceEntity,
        ]),
        ConfiguracionModule,
    ],
    controllers: [OrdenesProduccionController, QualityLotsController],
    providers: [OrdenesProduccionService, QualityLotsService],
    exports: [OrdenesProduccionService],
})
export class QualityModule {}
