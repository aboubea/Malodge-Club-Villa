import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@malodge/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Global search (Ctrl+K): stays, villas, extras, people, catalogue' })
  find(@Query('q') q = '', @CurrentUser() user: { role: string; countries?: string[] }) {
    return this.search.search(String(q), user);
  }
}
