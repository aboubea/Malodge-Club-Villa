import { Injectable, NotFoundException } from '@nestjs/common';
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
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.villaId) where.villaId = params.villaId;
    if (params.clientId) where.clientId = params.clientId;
    if (params.status) where.status = params.status;
    if (params.country) where.villa = { ...(where.villa || {}), country: params.country };

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
          villa: { select: { id: true, name: true, city: true, coverImage: true } },
          client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
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

  async findOne(id: string) {
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
    return reservation;
  }

  async create(dto: CreateReservationDto) {
    return this.prisma.reservation.create({
      data: {
        ...dto,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
      },
      include: {
        villa: { select: { id: true, name: true, city: true } },
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async update(id: string, dto: UpdateReservationDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.checkIn) data.checkIn = new Date(dto.checkIn);
    if (dto.checkOut) data.checkOut = new Date(dto.checkOut);

    return this.prisma.reservation.update({
      where: { id },
      data,
      include: {
        villa: { select: { id: true, name: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
