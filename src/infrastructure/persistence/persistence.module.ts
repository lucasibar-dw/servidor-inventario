import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemEntity } from '../../modules/config/infrastructure/persistence/entities/item.entity';
import { DepotEntity, PositionEntity } from '../../modules/warehouse/infrastructure/persistence/entities/depot.entity';
import { BoxTypeEntity } from '../../modules/config/infrastructure/persistence/entities/box-type.entity';
import { StockBalanceEntity } from '../../modules/warehouse/infrastructure/persistence/entities/stock-balance.entity';
import { UserEntity } from '../../modules/config/infrastructure/persistence/entities/user.entity';
import { PartnerEntity } from '../../modules/config/infrastructure/persistence/entities/partner.entity';
import { BatchEntity } from '../../modules/warehouse/infrastructure/persistence/entities/batch.entity';
import { DocumentoEntity } from '../../modules/warehouse/infrastructure/persistence/entities/documento.entity';
import { MovimientoEntity } from '../../modules/warehouse/infrastructure/persistence/entities/movimiento.entity';
import { TaskPersistenceEntity } from '../../modules/warehouse/infrastructure/persistence/entities/task.entity';
import { TaskTypeCatalogEntity } from '../../modules/warehouse/infrastructure/persistence/entities/task-type-catalog.entity';
import { ItemCategoryEntity } from '../../modules/config/infrastructure/persistence/entities/item-category.entity';
import { ComboCompraEntity } from '../../modules/purchasing/infrastructure/persistence/entities/combo-compra.entity';

import { TypeOrmUserRepository } from '../../modules/config/infrastructure/persistence/repositories/typeorm-user.repository';
import { MovimientoSubscriber } from './subscribers/movimiento.subscriber';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ItemEntity,
            DepotEntity,
            PositionEntity,
            BoxTypeEntity,
            StockBalanceEntity,
            BatchEntity,
            UserEntity,
            PartnerEntity,
            DocumentoEntity,
            MovimientoEntity,
            TaskPersistenceEntity,
            TaskTypeCatalogEntity,
            ItemCategoryEntity,
            ComboCompraEntity,
        ]),
    ],
    providers: [
        {
            provide: 'IUserRepository',
            useClass: TypeOrmUserRepository,
        },
        MovimientoSubscriber,
    ],
    exports: [TypeOrmModule, 'IUserRepository', MovimientoSubscriber],
})
export class PersistenceModule { }
