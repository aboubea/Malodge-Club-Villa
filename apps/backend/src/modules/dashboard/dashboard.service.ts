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
}
