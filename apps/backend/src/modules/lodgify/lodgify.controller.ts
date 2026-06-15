import { Controller, Get, Post, Body } from '@nestjs/common';
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

  @Get('properties')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List properties directly from Lodgify (no DB write)' })
  listProperties() {
    return this.lodgifyService.listProperties();
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
