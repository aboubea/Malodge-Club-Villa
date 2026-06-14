import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationStatus } from '@mahodge/shared';

@ApiTags('Reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'List reservations' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('villaId') villaId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: ReservationStatus,
  ) {
    return this.reservationsService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      villaId,
      clientId,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reservation by ID' })
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create reservation' })
  create(@Body() dto: CreateReservationDto) {
    return this.reservationsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update reservation' })
  update(@Param('id') id: string, @Body() dto: UpdateReservationDto) {
    return this.reservationsService.update(id, dto);
  }
}
