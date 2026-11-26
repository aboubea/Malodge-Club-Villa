import { Controller, Get, Headers, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { StatementsService } from '../statements/statements.service';
import { previousMonth } from '../statements/statement';
import { StaySpaceService } from '../stay-space/stay-space.service';

/**
 * Jobs started by Vercel's scheduler (vercel.json › crons). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; without that variable nothing runs.
 */
@ApiTags('Cron')
@Controller('cron')
export class CronController {
  constructor(
    private statements: StatementsService,
    private stays: StaySpaceService,
  ) {}

  private check(auth?: string) {
    const secret = (process.env.CRON_SECRET ?? '').trim();
    if (!secret) throw new ServiceUnavailableException('CRON_SECRET non configurée : tâches planifiées désactivées.');
    const given = Buffer.from(auth ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();
  }

  /** Every morning: new Lodgify bookings (read only), then the guest messages due today. */
  @Get('daily')
  @Public()
  async daily(@Headers('authorization') auth?: string) {
    this.check(auth);
    return { guests: await this.stays.daily() };
  }

  /** On the 1st: owners' statements of the month that just ended, as drafts to check. */
  @Get('monthly')
  @Public()
  async monthly(@Headers('authorization') auth?: string) {
    this.check(auth);
    return { statements: await this.statements.prepareMonth(previousMonth()) };
  }
}
