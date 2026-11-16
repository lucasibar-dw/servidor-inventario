import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlantEntity } from './domain/entities/plant.entity';
import { MachineEntity } from './domain/entities/machine.entity';
import { MachineTypeEntity } from './domain/entities/machine-type.entity';
import { MaintenanceLogEntity } from './domain/entities/maintenance-log.entity';
import { MaintenanceService } from './application/maintenance.service';
import { MaintenanceController } from './infrastructure/maintenance.controller';
import { DepotEntity } from '../warehouse/infrastructure/persistence/entities/depot.entity';
import { MachineChangeEntity } from './domain/entities/machine-change.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            PlantEntity,
            MachineEntity,
            MachineTypeEntity,
            MaintenanceLogEntity,
            DepotEntity,
            MachineChangeEntity
        ])
    ],
    providers: [MaintenanceService],
    controllers: [MaintenanceController],
    exports: [MaintenanceService]
})
export class MaintenanceModule { }
