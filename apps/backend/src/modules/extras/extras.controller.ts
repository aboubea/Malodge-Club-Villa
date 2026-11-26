import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@malodge/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowRestrictedRoles, Roles } from '../../common/decorators/roles.decorator';
import { Actor, ExtrasService } from './extras.service';
import {
  CreatePersonDto,
  CreateSettlementDto,
  ExtraFiltersDto,
  ExtrasSettingsDto,
  SettlementFiltersDto,
  UpdatePersonDto,
  UpdateSettlementDto,
  UpdateVillaExtrasDto,
  UpsertCatalogueItemDto,
  UpsertExtraDto,
  UpsertStayDto,
} from './extras.dto';
import { AccountRole } from './extras.calc';

@ApiTags('Extras')
@ApiBearerAuth()
@Controller('extras')
export class ExtrasController {
  constructor(private extras: ExtrasService) {}

  /* My account — every role, including owners and employees */
  @Get('me')
  @AllowRestrictedRoles()
  @ApiOperation({ summary: "Current user's extras account (client, provider, owner or employee)" })
  me(@CurrentUser() user: Actor) {
    return this.extras.me(user);
  }

  /* Overview */
  @Get('summary')
  @Roles(Role.MANAGER)
  summary(@CurrentUser() user: Actor) {
    return this.extras.summary(user);
  }

  @Get('options')
  @Roles(Role.MANAGER)
  options(@CurrentUser() user: Actor) {
    return this.extras.options(user);
  }

  /* Extras lines */
  @Get('lines')
  @Roles(Role.MANAGER)
  list(@Query() filters: ExtraFiltersDto, @CurrentUser() user: Actor) {
    return this.extras.listExtras(filters, user);
  }

  @Post('lines')
  @Roles(Role.MANAGER)
  create(@Body() dto: UpsertExtraDto) {
    return this.extras.createExtra(dto);
  }

  @Put('lines/:id')
  @Roles(Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpsertExtraDto) {
    return this.extras.updateExtra(id, dto);
  }

  @Delete('lines/:id')
  @Roles(Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.extras.deleteExtra(id);
  }

  /* Accounts */
  @Get('accounts')
  @Roles(Role.MANAGER)
  accounts(@Query('role') role: AccountRole | undefined, @CurrentUser() user: Actor) {
    return this.extras.accounts(user, role);
  }

  /* Settlements */
  @Get('settlements')
  @Roles(Role.MANAGER)
  settlements(@Query() filters: SettlementFiltersDto, @CurrentUser() user: Actor) {
    return this.extras.listSettlements(filters, user);
  }

  @Post('settlements')
  @Roles(Role.MANAGER)
  createSettlement(@Body() dto: CreateSettlementDto, @CurrentUser() user: Actor) {
    return this.extras.createSettlement(dto, user);
  }

  @Patch('settlements/:id')
  @Roles(Role.MANAGER)
  updateSettlement(@Param('id') id: string, @Body() dto: UpdateSettlementDto, @CurrentUser() user: Actor) {
    return this.extras.updateSettlement(id, dto, user);
  }

  @Post('settlements/:id/validate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Validate a settlement — ADMIN+ only' })
  validate(@Param('id') id: string, @CurrentUser() user: Actor) {
    return this.extras.setSettlementStatus(id, 'VALIDATED', user);
  }

  @Post('settlements/:id/cancel')
  @Roles(Role.ADMIN)
  cancel(@Param('id') id: string, @CurrentUser() user: Actor) {
    return this.extras.setSettlementStatus(id, 'CANCELLED', user);
  }

  @Post('settlements/:id/reopen')
  @Roles(Role.ADMIN)
  reopen(@Param('id') id: string, @CurrentUser() user: Actor) {
    return this.extras.setSettlementStatus(id, 'PENDING', user);
  }

  /* Settings: people, villas, stays, markup */
  @Get('settings')
  @Roles(Role.MANAGER)
  settings(@CurrentUser() user: Actor) {
    return this.extras.settings(user);
  }

  @Put('settings')
  @Roles(Role.ADMIN)
  updateSettings(@Body() dto: ExtrasSettingsDto) {
    return this.extras.setMarkup(dto.markup);
  }

  @Post('people')
  @Roles(Role.MANAGER)
  createPerson(@Body() dto: CreatePersonDto, @CurrentUser() user: Actor) {
    // Only admins set commission rates.
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      dto.commissionRate = undefined;
      dto.commissionBase = undefined;
    }
    return this.extras.createPerson(dto);
  }

  @Patch('people/:id')
  @Roles(Role.MANAGER)
  updatePerson(@Param('id') id: string, @Body() dto: UpdatePersonDto, @CurrentUser() user: Actor) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      dto.commissionRate = undefined;
      dto.commissionBase = undefined;
    }
    return this.extras.updatePerson(id, dto);
  }

  @Patch('villas/:id')
  @Roles(Role.ADMIN)
  updateVilla(@Param('id') id: string, @Body() dto: UpdateVillaExtrasDto) {
    return this.extras.updateVilla(id, dto);
  }

  @Post('stays')
  @Roles(Role.MANAGER)
  createStay(@Body() dto: UpsertStayDto) {
    return this.extras.createStay(dto);
  }

  @Put('stays/:id')
  @Roles(Role.MANAGER)
  updateStay(@Param('id') id: string, @Body() dto: UpsertStayDto) {
    return this.extras.updateStay(id, dto);
  }

  /* Catalogue */
  @Get('catalogue')
  @Roles(Role.MANAGER)
  catalogue() {
    return this.extras.catalogue();
  }

  @Post('catalogue')
  @Roles(Role.MANAGER)
  createCatalogueItem(@Body() dto: UpsertCatalogueItemDto) {
    return this.extras.createCatalogueItem(dto);
  }

  @Patch('catalogue/:id')
  @Roles(Role.MANAGER)
  updateCatalogueItem(@Param('id') id: string, @Body() dto: UpsertCatalogueItemDto) {
    return this.extras.updateCatalogueItem(id, dto);
  }
}
