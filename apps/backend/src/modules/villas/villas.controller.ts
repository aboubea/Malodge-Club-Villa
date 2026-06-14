import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VillasService } from './villas.service';
import { CreateVillaDto } from './dto/create-villa.dto';
import { UpdateVillaDto } from './dto/update-villa.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Villas')
@ApiBearerAuth()
@Controller('villas')
export class VillasController {
  constructor(private villasService: VillasService) {}

  @Get()
  @ApiOperation({ summary: 'List all villas' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.villasService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      city,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get villa by ID' })
  findOne(@Param('id') id: string) {
    return this.villasService.findOne(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Create villa' })
  create(@Body() dto: CreateVillaDto) {
    return this.villasService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update villa' })
  update(@Param('id') id: string, @Body() dto: UpdateVillaDto) {
    return this.villasService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete villa' })
  remove(@Param('id') id: string) {
    return this.villasService.remove(id);
  }
}
