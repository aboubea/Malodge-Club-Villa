import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { InviteProviderDto } from './dto/invite-provider.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'List providers' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.providersService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get provider by ID' })
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }

  @Post('invite')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create user + provider profile in one step — ADMIN+ only' })
  inviteProvider(@Body() dto: InviteProviderDto) {
    return this.providersService.inviteProvider(dto);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create provider from existing user — ADMIN+ only' })
  create(@Body() dto: CreateProviderDto) {
    return this.providersService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update provider — MANAGER+ only' })
  update(@Param('id') id: string, @Body() dto: UpdateProviderDto) {
    return this.providersService.update(id, dto);
  }
}
