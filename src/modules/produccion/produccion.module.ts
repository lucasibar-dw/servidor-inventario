import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgramacionMaquinaEntity } from './domain/entities/programacion-maquina.entity';
import { MachineEntity } from '../maintenance/domain/entities/machine.entity';
import { BalancePedidoVentaEntity } from '../ventas/infrastructure/persistence/entities/balance-pedido-venta.entity';
import { ArticuloMachineTypeEntity } from '../articulos/infrastructure/persistence/entities/articulo-machine-type.entity';
import { ArticuloEntity } from '../articulos/infrastructure/persistence/entities/articulo.entity';

import { ProgramacionService } from './application/services/programacion.service';
import { ProgramacionController } from './web/controllers/programacion.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ProgramacionMaquinaEntity,
            MachineEntity,
            BalancePedidoVentaEntity,
            ArticuloMachineTypeEntity,
            ArticuloEntity,
        ]),
    ],
    controllers: [ProgramacionController],
    providers: [ProgramacionService],
    exports: [ProgramacionService],
})
export class ProduccionModule { }
