import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComboCompraEntity } from './infrastructure/persistence/entities/combo-compra.entity';
import { StockBalanceEntity } from 'src/modules/warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { ItemEntity } from 'src/modules/config/infrastructure/persistence/entities/item.entity';
import { MovimientoEntity } from 'src/modules/warehouse/infrastructure/persistence/entities/movimiento.entity';
import { CombosCompraService } from './application/services/combos-compra.service';
import { CombosCompraController } from './web/controllers/combos-compra.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ComboCompraEntity,
            StockBalanceEntity,
            ItemEntity,
            MovimientoEntity,
        ]),
    ],
    controllers: [
        CombosCompraController,
    ],
    providers: [
        CombosCompraService,
    ],
    exports: [
        CombosCompraService,
    ],
})
export class PurchasingModule { }
