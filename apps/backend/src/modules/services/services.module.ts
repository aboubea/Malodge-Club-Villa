import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { ServiceCategoriesController } from './service-categories.controller';

@Module({
  providers: [ServicesService],
  controllers: [ServicesController, ServiceCategoriesController],
  exports: [ServicesService],
})
export class ServicesModule {}
