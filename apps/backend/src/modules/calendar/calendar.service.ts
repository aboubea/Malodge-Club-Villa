import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getEvents(params: {
    from: Date;
    to: Date;
    villaId?: string;
    type?: string;
    userId?: string;
    userRole?: string;
    userCountries?: string[];
  }) {
    const { from, to, villaId, type, userId, userRole, userCountries } = params;

    const villaFilter: any = villaId ? { villaId } : {};
    if (
      userRole &&
      ['ADMIN', 'MANAGER'].includes(userRole) &&
      userCountries &&
      userCountries.length > 0
    ) {
      villaFilter.villa = { country: { in: userCountries } };
    }

    const typeFilter = type && type !== 'all' ? { type } : {};

    // 1. Custom CalendarEvent records
    const [customEvents, reservations, orders] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          startAt: { lte: to },
          endAt: { gte: from },
          ...(villaId ? { villaId } : {}),
          ...typeFilter,
        },
        include: {
          villa: { select: { id: true, name: true, city: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { startAt: 'asc' },
      }),

      // 2. Reservations as events
      this.prisma.reservation.findMany({
        where: {
          checkIn: { lte: to },
          checkOut: { gte: from },
          ...(villaId ? { villaId } : {}),
          ...(userId && userRole === 'CLIENT' ? { clientId: userId } : {}),
          ...(
            userRole && ['ADMIN', 'MANAGER'].includes(userRole) && userCountries && userCountries.length > 0
              ? { villa: { country: { in: userCountries } } }
              : {}
          ),
          ...(type && type !== 'reservation' && type !== 'all' ? { id: { in: [] } } : {}),
        },
        include: {
          villa: { select: { id: true, name: true, city: true, coverImage: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { checkIn: 'asc' },
      }),

      // 3. Scheduled orders as events
      this.prisma.order.findMany({
        where: {
          scheduledAt: { gte: from, lte: to },
          NOT: { scheduledAt: null },
          ...(villaId ? { reservation: { villaId } } : {}),
          ...(userId && userRole === 'CLIENT' ? { clientId: userId } : {}),
          ...(type && type !== 'order' && type !== 'all' ? { id: { in: [] } } : {}),
        },
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          items: { include: { service: { select: { id: true, name: true } } } },
          reservation: { include: { villa: { select: { id: true, name: true } } } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    // Normalize to unified event shape
    const events: any[] = [
      ...customEvents.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        allDay: e.allDay,
        type: e.type,
        color: e.color || '#6B6B6F',
        villaId: e.villaId,
        villa: e.villa,
        reservationId: e.reservationId,
        orderId: e.orderId,
        createdBy: e.creator,
        source: 'custom',
      })),
      ...reservations.map((r) => ({
        id: `res-${r.id}`,
        title: `${r.client.firstName} ${r.client.lastName} — ${r.villa.name}`,
        description: `${r.guests} voyageur(s) · ${r.status}`,
        startAt: r.checkIn.toISOString(),
        endAt: r.checkOut.toISOString(),
        allDay: true,
        type: 'reservation',
        color: r.status === 'CONFIRMED' ? '#C9A96E' : r.status === 'ACTIVE' ? '#22c55e' : r.status === 'CANCELLED' ? '#ef4444' : '#6B6B6F',
        villaId: r.villaId,
        villa: r.villa,
        reservationId: r.id,
        client: r.client,
        source: 'reservation',
      })),
      ...orders.map((o) => ({
        id: `ord-${o.id}`,
        title: o.items.length > 0 ? o.items[0].service.name : 'Commande',
        description: `${o.items.length} service(s) · ${o.status}`,
        startAt: o.scheduledAt!.toISOString(),
        endAt: new Date(o.scheduledAt!.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        allDay: false,
        type: 'order',
        color: '#8B5CF6',
        villaId: o.reservation?.villa?.id,
        villa: o.reservation?.villa,
        orderId: o.id,
        client: o.client,
        source: 'order',
      })),
    ];

    events.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return { data: events };
  }

  async create(dto: CreateCalendarEventDto, createdBy: string) {
    return this.prisma.calendarEvent.create({
      data: {
        ...dto,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        createdBy,
      },
      include: {
        villa: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCalendarEventDto) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`CalendarEvent ${id} not found`);

    const data: any = { ...dto };
    if (dto.startAt) data.startAt = new Date(dto.startAt);
    if (dto.endAt) data.endAt = new Date(dto.endAt);

    return this.prisma.calendarEvent.update({
      where: { id },
      data,
      include: {
        villa: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(id: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`CalendarEvent ${id} not found`);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { message: 'Event deleted' };
  }
}
