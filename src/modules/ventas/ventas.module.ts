import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BalancePedidoVentaEntity } from './infrastructure/persistence/entities/balance-pedido-venta.entity';
import { MovimientoPedidoVentaEntity } from './infrastructure/persistence/entities/movimiento-pedido-venta.entity';
import { ArticuloEntity } from '../articulos/infrastructure/persistence/entities/articulo.entity';
import { ArticuloEstructuraEntity } from '../articulos/infrastructure/persistence/entities/articulo-estructura.entity';
import { MovimientoArticuloEntity } from '../articulos/infrastructure/persistence/entities/movimiento-articulo.entity';

import { VentasService } from './application/services/ventas.service';
import { VentasController } from './web/controllers/ventas.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            BalancePedidoVentaEntity,
            MovimientoPedidoVentaEntity,
            ArticuloEntity,
            ArticuloEstructuraEntity,
            MovimientoArticuloEntity,
        ]),
    ],
    controllers: [VentasController],
    providers: [VentasService],
    exports: [VentasService],
})
export class VentasModule { }
