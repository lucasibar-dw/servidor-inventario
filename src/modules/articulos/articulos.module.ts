import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticuloEntity } from './infrastructure/persistence/entities/articulo.entity';
import { MovimientoArticuloEntity } from './infrastructure/persistence/entities/movimiento-articulo.entity';
import { BalanceStockArticuloEntity } from './infrastructure/persistence/entities/balance-stock-articulo.entity';
import { ArticuloEstructuraEntity } from './infrastructure/persistence/entities/articulo-estructura.entity';
import { ArticuloItemEquivalenciaEntity } from './infrastructure/persistence/entities/articulo-item-equivalencia.entity';
import { ArticuloMachineTypeEntity } from './infrastructure/persistence/entities/articulo-machine-type.entity';
import { ItemEntity } from '../config/infrastructure/persistence/entities/item.entity';
import { StockBalanceEntity } from '../warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { MovimientoArticuloSubscriber } from './infrastructure/persistence/subscribers/movimiento-articulo.subscriber';
import { ArticulosService } from './application/services/articulos.service';
import { MovimientosArticulosService } from './application/services/movimientos-articulos.service';
import { BalanceStockArticulosService } from './application/services/balance-stock-articulos.service';
import { EstructurasService } from './application/services/estructuras.service';
import { ArticuloItemEquivalenciasService } from './application/services/articulo-item-equivalencias.service';
import { ArticulosController } from './web/controllers/articulos.controller';
import { MovimientosArticulosController } from './web/controllers/movimientos-articulos.controller';
import { BalanceStockArticulosController } from './web/controllers/balance-stock-articulos.controller';
import { EstructurasController } from './web/controllers/estructuras.controller';
import { ArticuloItemEquivalenciasController } from './web/controllers/articulo-item-equivalencias.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ArticuloEntity,
            MovimientoArticuloEntity,
            BalanceStockArticuloEntity,
            ArticuloEstructuraEntity,
            ArticuloItemEquivalenciaEntity,
            ArticuloMachineTypeEntity,
            ItemEntity,
            StockBalanceEntity,
        ]),
    ],
    controllers: [
        ArticulosController,
        MovimientosArticulosController,
        BalanceStockArticulosController,
        EstructurasController,
        ArticuloItemEquivalenciasController,
    ],
    providers: [
        ArticulosService,
        MovimientosArticulosService,
        BalanceStockArticulosService,
        EstructurasService,
        ArticuloItemEquivalenciasService,
        MovimientoArticuloSubscriber,
    ],
    exports: [
        ArticulosService,
        MovimientosArticulosService,
        BalanceStockArticulosService,
        EstructurasService,
        ArticuloItemEquivalenciasService,
        MovimientoArticuloSubscriber,
    ],
})
export class ArticulosModule { }
