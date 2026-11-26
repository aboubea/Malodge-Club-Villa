import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { calendarDay } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationStatus } from '@malodge/shared';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    villaId?: string;
    clientId?: string;
    status?: ReservationStatus;
    country?: string;
    userRole?: string;
    userCountries?: string[];
    /** Stays overlapping [from, to] (YYYY-MM-DD), for the calendar. */
    from?: string;
    to?: string;
    /** Stays without dates (dates not given yet). */
    undated?: boolean;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.villaId) where.villaId = params.villaId;
    if (params.clientId) where.clientId = params.clientId;
    if (params.status) where.status = params.status;
    if (params.country) where.villa = { ...(where.villa || {}), country: params.country };
    const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);
    const from = day(params.from);
    const to = day(params.to);
    if (params.undated) where.OR = [{ checkIn: null }, { checkOut: null }];
    else if (from && to) {
      where.checkIn = { lte: to };
      where.checkOut = { gte: from };
    }

    if (
      params.userRole &&
      ['ADMIN', 'MANAGER'].includes(params.userRole) &&
      params.userCountries &&
      params.userCountries.length > 0
    ) {
      if (params.country) {
        if (!params.userCountries.includes(params.country)) {
          where.villa = { ...(where.villa || {}), country: '__none__' };
        }
      } else {
        where.villa = { ...(where.villa || {}), country: { in: params.userCountries } };
      }
    }

    const [reservations, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        include: {
          villa: { select: { id: true, name: true, city: true, coverImage: true, currency: true } },
          client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { checkIn: 'desc' },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      data: reservations,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, requestingClientId?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        villa: true,
        client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        orders: {
          include: {
            items: { include: { service: true } },
            provider: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
        conversations: { include: { messages: { take: 5, orderBy: { createdAt: 'desc' } } } },
      },
    });
    if (!reservation) throw new NotFoundException(`Reservation ${id} not found`);
    if (requestingClientId && reservation.clientId !== requestingClientId) {
      throw new ForbiddenException('Access denied');
    }
    return reservation;
  }

  async create(dto: CreateReservationDto) {
    // Calendar days (00:00 UTC), whatever time came with them.
    const checkIn = calendarDay(dto.checkIn) as Date;
    const checkOut = calendarDay(dto.checkOut) as Date;

    if (!checkIn || !checkOut || isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      throw new BadRequestException('Invalid date format for checkIn or checkOut');
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    const overlap = await this.prisma.reservation.findFirst({
      where: {
        villaId: dto.villaId,
        status: { not: 'CANCELLED' as any },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `Villa already reserved from ${overlap.checkIn.toISOString().split('T')[0]} to ${overlap.checkOut.toISOString().split('T')[0]}`,
      );
    }

    return this.prisma.reservation.create({
      data: {
        ...dto,
        checkIn,
        checkOut,
      },
      include: {
        villa: { select: { id: true, name: true, city: true, currency: true } },
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async update(id: string, dto: UpdateReservationDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.checkIn) data.checkIn = calendarDay(dto.checkIn);
    if (dto.checkOut) data.checkOut = calendarDay(dto.checkOut);

    return this.prisma.reservation.update({
      where: { id },
      data,
      include: {
        villa: { select: { id: true, name: true, currency: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
