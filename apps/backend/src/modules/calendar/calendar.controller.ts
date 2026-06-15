import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/calendar.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Calendar')
@ApiBearerAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get()
  @ApiOperation({ summary: 'Get calendar events for a date range' })
  getEvents(
    @CurrentUser() user: { id: string; role: string; countries?: string[] },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('villaId') villaId?: string,
    @Query('type') type?: string,
  ) {
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to
      ? new Date(to)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return this.calendarService.getEvents({
      from: fromDate,
      to: toDate,
      villaId,
      type,
      userId: user.id,
      userRole: user.role,
      userCountries: user.countries || [],
    });
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Create calendar event' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update calendar event' })
  update(@Param('id') id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.calendarService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Delete calendar event' })
  remove(@Param('id') id: string) {
    return this.calendarService.remove(id);
  }
}
