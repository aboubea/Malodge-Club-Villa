import { BadRequestException, Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LodgifyService } from './lodgify.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Lodgify')
@ApiBearerAuth()
@Controller('lodgify')
export class LodgifyController {
  constructor(private lodgifyService: LodgifyService) {}

  @Get('status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Lodgify integration status' })
  getStatus() {
    return this.lodgifyService.getApiKeyStatus();
  }

  @Post('api-key')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Save Lodgify API key' })
  saveApiKey(@Body() body: { apiKey: string }) {
    return this.lodgifyService.saveApiKey(body.apiKey);
  }

  @Get('properties/raw')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Raw Lodgify payloads of one property (first one, or ?id=) and the capacity read from them' })
  getRawFirstProperty(@Query('id') id?: string) {
    return this.lodgifyService.getRawFirstProperty(id);
  }

  @Get('properties')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List properties directly from Lodgify (no DB write)' })
  listProperties() {
    return this.lodgifyService.listProperties();
  }

  @Get('properties/synced-ids')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get list of Lodgify IDs already saved in DB' })
  getSyncedIds() {
    return this.lodgifyService.getSyncedIds();
  }

  @Post('properties/save')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save a single Lodgify property to DB' })
  saveProperty(@Body() body: any) {
    return this.lodgifyService.saveProperty(body);
  }

  @Post('properties/save-all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save/sync all Lodgify properties to DB (upsert by logifyId)' })
  saveAllProperties(@Body() body: { properties: any[] }) {
    return this.lodgifyService.saveAllProperties(body.properties ?? []);
  }

  @Get('calendar')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Lodgify bookings of a period, read live, not yet copied into the app (calendar)' })
  calendar(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: { countries?: string[]; role: string },
    @Query('refresh') refresh?: string,
  ) {
    const day = (s: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);
    const a = day(from);
    const b = day(to);
    if (!a || !b) throw new BadRequestException('from et to attendus (AAAA-MM-JJ)');
    const restricted = ['ADMIN', 'MANAGER'].includes(user.role) ? user.countries ?? [] : [];
    return this.lodgifyService.calendarBookings(a, b, restricted, refresh === 'true');
  }

  @Post('properties/import')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add chosen Lodgify listings to the app (read-only on Lodgify)' })
  importListings(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string' || typeof x === 'number').map(String) : [];
    if (!ids.length) throw new BadRequestException('Aucune annonce choisie');
    return this.lodgifyService.importListings(ids);
  }

  @Get('reservations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List reservations directly from Lodgify (no DB write)' })
  listReservations() {
    return this.lodgifyService.listReservations();
  }

  @Post('sync/properties')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sync properties from Lodgify' })
  syncProperties() {
    return this.lodgifyService.syncProperties();
  }

  @Post('sync/reservations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sync reservations from Lodgify' })
  syncReservations() {
    return this.lodgifyService.syncReservations();
  }

  @Post('sync/all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sync properties then reservations from Lodgify' })
  async syncAll() {
    const properties = await this.lodgifyService.syncProperties();
    const reservations = await this.lodgifyService.syncReservations();
    return { properties, reservations };
  }
}
