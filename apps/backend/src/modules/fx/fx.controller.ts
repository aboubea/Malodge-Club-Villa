import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@malodge/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { FxService } from './fx.service';

@ApiTags('Fx')
@ApiBearerAuth()
@Controller('fx')
export class FxController {
  constructor(private fx: FxService) {}

  @Get()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: "Today's exchange rates (EUR base), to show amounts converted" })
  async quote() {
    const q = await this.fx.quote();
    return q ? { base: q.base, date: q.date, source: q.source, fetchedAt: q.fetchedAt, stale: !!q.stale, rates: { EUR: 1, MAD: q.rates.MAD, USD: q.rates.USD, GBP: q.rates.GBP, CHF: q.rates.CHF } } : null;
  }
}
