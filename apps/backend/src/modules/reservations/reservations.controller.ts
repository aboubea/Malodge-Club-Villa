import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, ReservationStatus } from '@malodge/shared';

@ApiTags('Reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'List reservations — CLIENT sees only their own' })
  findAll(
    @CurrentUser() user: { id: string; role: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('villaId') villaId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: ReservationStatus,
    @Query('country') country?: string,
  ) {
    return this.reservationsService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      villaId,
      clientId: user.role === Role.CLIENT ? user.id : clientId,
      status,
      country,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reservation by ID' })
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Create reservation — MANAGER+ only' })
  create(@Body() dto: CreateReservationDto) {
    return this.reservationsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update reservation — MANAGER+ only' })
  update(@Param('id') id: string, @Body() dto: UpdateReservationDto) {
    return this.reservationsService.update(id, dto);
  }
}
