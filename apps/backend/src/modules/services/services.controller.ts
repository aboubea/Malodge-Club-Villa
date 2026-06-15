import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

class AssignProviderDto {
  @ApiProperty()
  @IsString()
  providerId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}

@ApiTags('Services')
@ApiBearerAuth()
@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all services' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.servicesService.findAllServices({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      categoryId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get service by ID' })
  findOne(@Param('id') id: string) {
    return this.servicesService.findOneService(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Create service' })
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.createService(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update service' })
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.updateService(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete service' })
  remove(@Param('id') id: string) {
    return this.servicesService.removeService(id);
  }

  @Post(':id/providers')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Assign a provider to a service' })
  assignProvider(@Param('id') id: string, @Body() dto: AssignProviderDto) {
    return this.servicesService.assignProvider(id, dto.providerId, dto.isPreferred ?? false);
  }

  @Delete(':id/providers/:providerId')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Remove a provider from a service' })
  removeProvider(@Param('id') id: string, @Param('providerId') providerId: string) {
    return this.servicesService.removeProvider(id, providerId);
  }
}
