import { BadRequestException, Controller, Get, Post, Put, Body } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService, Country } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private mail: MailService,
  ) {}

  @Get('mail')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'E-mail configuration as the server sees it (no secret)' })
  mailStatus() {
    return this.mail.status();
  }

  @Post('mail/test')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Send a test e-mail and return Resend’s answer (sent, or the exact refusal)' })
  async mailTest(@Body() body: { to?: string }, @CurrentUser() me: { email: string }) {
    const to = (body?.to || me?.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new BadRequestException('Adresse e-mail invalide');
    return { to, ...(await this.mail.sendTest(to)), status: this.mail.status() };
  }

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
