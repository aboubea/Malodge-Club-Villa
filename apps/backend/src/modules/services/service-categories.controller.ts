import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceCategoryDto } from './dto/create-service.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Service Categories')
@ApiBearerAuth()
@Controller('service-categories')
export class ServiceCategoriesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List service categories' })
  findAll() {
    return this.servicesService.findAllCategories();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create service category' })
  create(@Body() dto: CreateServiceCategoryDto) {
    return this.servicesService.createCategory(dto);
  }
}
