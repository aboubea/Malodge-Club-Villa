import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService, Country } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('countries')
  @ApiOperation({ summary: 'Get configured countries' })
  getCountries() {
    return this.settingsService.getCountries();
  }

  @Put('countries')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set countries list — SUPER_ADMIN only' })
  setCountries(@Body() body: { countries: Country[] }) {
    return this.settingsService.setCountries(body.countries);
  }
}
