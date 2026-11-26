import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@malodge/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Actor } from './extras.service';
import { CommissionRulesService, UpsertCommissionRuleDto } from './commission-rules.service';

@ApiTags('Extras')
@ApiBearerAuth()
@Controller('extras/commission-rules')
export class CommissionRulesController {
  constructor(private rules: CommissionRulesService) {}

  @Get()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Commission rules on the extras, with what each applies to' })
  list(@CurrentUser() user: Actor) {
    return this.rules.list(user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a commission rule (owner or employee)' })
  create(@Body() dto: UpsertCommissionRuleDto) {
    return this.rules.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpsertCommissionRuleDto) {
    return this.rules.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.rules.remove(id);
  }
}
