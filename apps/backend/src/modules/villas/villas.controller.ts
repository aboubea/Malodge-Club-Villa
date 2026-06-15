import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VillasService } from './villas.service';
import { CreateVillaDto } from './dto/create-villa.dto';
import { UpdateVillaDto } from './dto/update-villa.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Villas')
@ApiBearerAuth()
@Controller('villas')
export class VillasController {
  constructor(private villasService: VillasService) {}

  @Get()
  @ApiOperation({ summary: 'List villas — CLIENT sees only their reserved villas' })
  findAll(
    @CurrentUser() user: { id: string; role: string },
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

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete villa — ADMIN+ only' })
  remove(@Param('id') id: string) {
    return this.villasService.remove(id);
  }
}
