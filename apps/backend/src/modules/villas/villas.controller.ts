import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VillasService } from './villas.service';
import { CreateVillaDto } from './dto/create-villa.dto';
import { UpdateVillaDto } from './dto/update-villa.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

class AssignServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  customPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  commission?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Villas')
@ApiBearerAuth()
@Controller('villas')
export class VillasController {
  constructor(private villasService: VillasService) {}

  @Get()
  @ApiOperation({ summary: 'List villas — CLIENT sees only their reserved villas' })
  findAll(
    @CurrentUser() user: { id: string; role: string; countries?: string[] },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.villasService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      city,
      country,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      clientId: user.role === Role.CLIENT ? user.id : undefined,
      userRole: user.role,
      userCountries: user.countries || [],
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get villa by ID' })
  findOne(@Param('id') id: string) {
    return this.villasService.findOne(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Create villa — MANAGER+ only' })
  create(@Body() dto: CreateVillaDto) {
    return this.villasService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update villa — MANAGER+ only' })
  update(@Param('id') id: string, @Body() dto: UpdateVillaDto) {
    return this.villasService.update(id, dto);
  }

  @Delete('all')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete ALL villas from DB — SUPER_ADMIN only' })
  removeAll() {
    return this.villasService.removeAll();
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete villa — ADMIN+ only' })
  remove(@Param('id') id: string) {
    return this.villasService.remove(id);
  }

  @Get(':id/services')
  @ApiOperation({ summary: 'Get services available for a villa with effective pricing' })
  getVillaServices(@Param('id') id: string) {
    return this.villasService.getVillaServices(id);
  }

  @Post(':id/services/:serviceId')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Link a service to a villa — MANAGER+' })
  assignService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: AssignServiceDto,
  ) {
    return this.villasService.assignService(id, serviceId, dto);
  }

  @Patch(':id/services/:serviceId')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update villa-service pricing/settings — MANAGER+' })
  updateVillaService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: AssignServiceDto,
  ) {
    return this.villasService.updateVillaService(id, serviceId, dto);
  }

  @Delete(':id/services/:serviceId')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Remove service from villa — MANAGER+' })
  removeVillaService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.villasService.removeVillaService(id, serviceId);
  }
}
