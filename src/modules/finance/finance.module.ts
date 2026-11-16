import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './application/finance.service';
import { FinanceController } from './infrastructure/finance.controller';
import { StockBalanceEntity } from '../warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { ItemEntity } from '../config/infrastructure/persistence/entities/item.entity';
import { ItemCategoryEntity } from '../config/infrastructure/persistence/entities/item-category.entity';
import { BatchEntity } from '../warehouse/infrastructure/persistence/entities/batch.entity';
import { DepotEntity } from '../warehouse/infrastructure/persistence/entities/depot.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            StockBalanceEntity,
            ItemEntity,
            ItemCategoryEntity,
            BatchEntity,
            DepotEntity,
        ]),
    ],
    controllers: [FinanceController],
    providers: [FinanceService],
    exports: [FinanceService],
})
export class FinanceModule {}
