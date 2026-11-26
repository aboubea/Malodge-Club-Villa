import { IsBoolean } from 'class-validator';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@malodge/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowRestrictedRoles, Roles } from '../../common/decorators/roles.decorator';
import { Actor, ExtrasService } from './extras.service';
import {
  ConvertCurrencyDto,
  MergePeopleDto,
  CreatePersonDto,
  CreateSettlementDto,
  MergeVillaDto,
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

class RetireImportDto {
  @IsBoolean()
  retired: boolean;
}

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

  @Get('villas/:id/merge-preview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'What merging this villa into another would move, and in which currency' })
  mergeVillaPreview(@Param('id') id: string, @Query('targetId') targetId: string) {
    if (!targetId) throw new BadRequestException('targetId requis');
    return this.extras.mergeVillaPreview(id, targetId);
  }

  @Post('villas/:id/convert-currency')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Move a villa to another currency, its extras converted at today's rate (original amounts kept)" })
  convertVillaCurrency(@Param('id') id: string, @Body() body: ConvertCurrencyDto) {
    return this.extras.convertVillaCurrency(id, body.to);
  }

  @Get('people/duplicates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'People of the same role whose names look alike (typos)' })
  peopleDuplicates() {
    return this.extras.peopleDuplicates();
  }

  @Post('people/merge-identical')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Merge the records of the same role with exactly the same name (stays kept apart)' })
  mergeIdenticalPeople() {
    return this.extras.mergeIdenticalPeople();
  }

  @Get('people/:id/merge-preview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'What merging this person into another moves' })
  peopleMergePreview(@Param('id') id: string, @Query('targetId') targetId: string) {
    if (!targetId) throw new BadRequestException('targetId requis');
    return this.extras.peopleMergePreview(id, targetId);
  }

  @Post('people/:id/merge')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Merge a duplicate person into another (stays, extras, payments… move; old name remembered)' })
  mergePeople(@Param('id') id: string, @Body() dto: MergePeopleDto) {
    return this.extras.mergePeople(id, dto.targetId, !!dto.mergeStays);
  }

  @Post('villas/:id/group')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Make a Lodgify listing a formula of another (same house, own rooms and price)' })
  groupVilla(@Param('id') id: string, @Body() dto: MergeVillaDto) {
    return this.extras.groupVilla(id, dto.targetId);
  }

  @Post('villas/:id/ungroup')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Make a formula a separate villa again' })
  ungroupVilla(@Param('id') id: string) {
    return this.extras.ungroupVilla(id);
  }

  @Post('villas/:id/merge')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Merge a duplicate villa into another one (local data only, never Lodgify)' })
  mergeVilla(@Param('id') id: string, @Body() dto: MergeVillaDto) {
    return this.extras.mergeVilla(id, dto.targetId);
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

  /* Spreadsheet import (admins) */
  @Get('import')
  @Roles(Role.ADMIN)
  importStatus() {
    return this.extras.importStatus();
  }

  @Post('import/retire')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Switch the Excel import off (Lodgify only) or back on' })
  retireImport(@Body() dto: RetireImportDto, @CurrentUser('id') actorId: string) {
    return this.extras.setExcelImportRetired(dto.retired, actorId);
  }

  @Post('import/undo')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Undo the spreadsheet import. dryRun=true previews what would be deleted.' })
  undoImport(@Query('dryRun') dryRun?: string) {
    return this.extras.undoWorkbookImport(dryRun !== 'false');
  }

  @Post('import')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Import the extras spreadsheet (.xlsx). dryRun=true previews without writing.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024, files: 1 } }))
  importWorkbook(
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Query('dryRun') dryRun?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu.');
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Format attendu : classeur Excel .xlsx');
    return this.extras.importWorkbook(file.buffer, { dryRun: dryRun !== 'false', fileName: file.originalname });
  }

  @Get('coherence')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Data coherence report (read-only)' })
  coherence(@CurrentUser() actor: Actor) {
    return this.extras.coherence(actor);
  }

  @Post('import/check-dates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Compare the app dates with the extras spreadsheet; `apply` (JSON list of ids) puts the file dates back' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024, files: 1 } }))
  checkImportDates(
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body('apply') apply?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu.');
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Format attendu : classeur Excel .xlsx');
    let ids: string[] = [];
    if (apply) {
      try {
        ids = JSON.parse(apply);
      } catch {
        throw new BadRequestException('Liste des corrections illisible.');
      }
      if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw new BadRequestException('Liste des corrections illisible.');
    }
    return this.extras.checkImportDates(file.buffer, ids);
  }

  /* Catalogue */
  @Get('catalogue')
  @Roles(Role.MANAGER)
  catalogue() {
    return this.extras.catalogue();
  }

  @Post('catalogue/cleanup')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Merge duplicate categories and services. dryRun=true previews.' })
  cleanupCatalogue(@Query('dryRun') dryRun?: string) {
    return this.extras.cleanupCatalogue(dryRun !== 'false');
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
