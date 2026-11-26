import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private finance: FinanceService,
  ) {}

  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Stay dates are calendar days stored at 00:00 UTC.
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [
      month,
      staysUnderWay,
      pendingOrders,
      recentReservations,
      villaCount,
      activeVillaCount,
      clientsThisMonth,
      ordersThisMonth,
    ] = await Promise.all([
      // Revenue of the month: exactly the figure of the Finances page (accommodation of the
      // nights of the month + extras realised), converted to dirhams.
      this.finance.getDashboard('month', undefined, now),
      // Stays under way today (arrival ≤ today ≤ departure), not every confirmed booking.
      this.prisma.reservation.findMany({
        where: { status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, checkIn: { lt: new Date(today.getTime() + 86_400_000) }, checkOut: { gte: today } },
        select: { checkOut: true, villaId: true, villa: { select: { parentVillaId: true } } },
      }),
      this.prisma.order.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.reservation.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          villa: { select: { id: true, name: true, city: true, coverImage: true } },
        },
      }),
      this.prisma.villa.count(),
      this.prisma.villa.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: { role: 'CLIENT', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    const t = month.totals;
    const revenueChange = month.changes.revenue ?? 0;
    // Occupancy tonight: active houses with a stay tonight (a house and its formulas count once).
    const activeHouses = await this.prisma.villa.count({ where: { isActive: true, parentVillaId: null } });
    const occupiedHouses = new Set(
      staysUnderWay.filter((r) => r.checkOut! > today).map((r) => r.villa.parentVillaId ?? r.villaId),
    ).size;
    const occupancyRate = activeHouses > 0 ? Math.min(100, Math.round((occupiedHouses / activeHouses) * 100)) : 0;
    const activeReservations = staysUnderWay.length;

    return {
      kpis: {
        totalRevenue: t.revenue,
        /** The two parts of totalRevenue. */
        accommodationRevenue: t.accommodation,
        extrasRevenue: t.extras,
        /** Currency of totalRevenue. */
        revenueCurrency: month.currency,
        /** True when totalRevenue adds amounts of other currencies converted to MAD. */
        revenueConverted: month.converted && month.currencies.some((r) => r.currency !== 'MAD'),
        fx: month.fx,
        revenueByCurrency: month.currencies,
        revenueChange: Math.round(revenueChange),
        previousMonth: month.previousRange.label,
        activeReservations,
        pendingOrders,
        activeVillas: activeVillaCount,
        totalVillas: villaCount,
        occupancyRate,
        activeClients: clientsThisMonth,
        ordersThisMonth,
      },
      recentReservations,
    };
  }
  /**
   * The home page: today's arrivals and departures, stays under way and the arrivals of the
   * week (with the villa's photo), and what is waiting to be done.
   */
  async today() {
    const DAY = 86_400_000;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const in7 = new Date(today.getTime() + 7 * DAY);
    const previousMonth = (() => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const [stays, pendingRequests, overdueExtras, draftStatements] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, checkIn: { lte: in7 }, checkOut: { gte: today } },
        orderBy: { checkIn: 'asc' },
        take: 200,
        select: {
          id: true, label: true, checkIn: true, checkOut: true, guests: true, invitedAt: true, logifyId: true, source: true,
          client: { select: { firstName: true, lastName: true } },
          villa: { select: { id: true, name: true, coverImage: true, images: true, parentVilla: { select: { id: true, name: true, coverImage: true, images: true } } } },
        },
      }),
      // Requests from guests waiting for the team's answer.
      this.prisma.order.count({ where: { status: 'PENDING', scheduledAt: { gte: today } } }),
      // Extras whose day has passed but never closed (not in the revenue until they are).
      this.prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, scheduledAt: { lt: today } } }),
      this.prisma.ownerStatement.count({ where: { month: previousMonth, status: 'DRAFT' } }),
    ]);
    const card = (s: (typeof stays)[number]) => {
      const house = s.villa.parentVilla ?? s.villa;
      const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
      return {
        id: s.id,
        guest: s.label || [s.client?.firstName, s.client?.lastName].filter(Boolean).join(' ') || 'Voyageur',
        villa: { id: house.id, name: house.name, photo: house.coverImage || house.images?.[0] || s.villa.coverImage || s.villa.images?.[0] || null },
        checkIn: day(s.checkIn),
        checkOut: day(s.checkOut),
        nights: s.checkIn && s.checkOut ? Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / DAY) : null,
        guests: s.source?.startsWith('extras') ? null : s.guests,
        invited: !!s.invitedAt,
      };
    };
    const t = today.getTime();
    const arrivals = stays.filter((s) => s.checkIn && s.checkIn.getTime() === t).map(card);
    const departures = stays.filter((s) => s.checkOut && s.checkOut.getTime() === t).map(card);
    const inHouse = stays.filter((s) => s.checkIn && s.checkOut && s.checkIn.getTime() < t && s.checkOut.getTime() > t).map(card);
    const upcoming = stays.filter((s) => s.checkIn && s.checkIn.getTime() > t).map(card);
    const toInvite = [...arrivals, ...upcoming].filter((c) => !c.invited).length;
    return {
      date: today.toISOString().slice(0, 10),
      arrivals,
      departures,
      inHouse,
      upcoming,
      todo: { pendingRequests, overdueExtras, toInvite, draftStatements, statementsMonth: previousMonth },
    };
  }
}
