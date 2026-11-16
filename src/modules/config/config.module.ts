import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemEntity } from './infrastructure/persistence/entities/item.entity';
import { ItemCategoryEntity } from './infrastructure/persistence/entities/item-category.entity';
import { PartnerEntity } from './infrastructure/persistence/entities/partner.entity';
import { BoxTypeEntity } from './infrastructure/persistence/entities/box-type.entity';
import { DepotEntity } from '../warehouse/infrastructure/persistence/entities/depot.entity';
import { ItemsService } from './application/services/items.service';
import { PartnersService } from './application/services/partners.service';
import { CategoriesService } from './application/services/categories.service';
import { BoxTypesService } from './application/services/box-types.service';
import { SystemConfigService } from './application/services/system-config.service';
import { ItemsController } from './web/controllers/items.controller';
import { PartnersController } from './web/controllers/partners.controller';
import { CategoriesController } from './web/controllers/categories.controller';
import { BoxTypesController } from './web/controllers/box-types.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ItemCategoryEntity,
      PartnerEntity,
      BoxTypeEntity,
      DepotEntity,
    ]),
  ],
  controllers: [
    CategoriesController,
    ItemsController,
    PartnersController,
    BoxTypesController,
  ],
  providers: [
    ItemsService,
    PartnersService,
    CategoriesService,
    BoxTypesService,
    SystemConfigService,
  ],
  exports: [
    ItemsService,
    PartnersService,
    CategoriesService,
    BoxTypesService,
    SystemConfigService,
  ],
})
export class ConfiguracionModule {}
