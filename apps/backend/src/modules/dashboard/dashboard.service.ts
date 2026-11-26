import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { DEFAULT_CURRENCY, orderCurrency, serviceDateBetween, totalsByCurrency } from '../../common/money';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
  ) {}

  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    // Stay dates are calendar days stored at 00:00 UTC.
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [
      monthOrders,
      lastMonthOrders,
      villaRows,
      staysUnderWay,
      pendingOrders,
      recentReservations,
      villaCount,
      activeVillaCount,
      clientsThisMonth,
      ordersThisMonth,
    ] = await Promise.all([
      this.prisma.order.findMany({
        // Revenue of the month = services done this month (not keyed in this month).
        where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] }, ...serviceDateBetween(startOfMonth) },
        select: { totalAmount: true, villaId: true, reservation: { select: { villaId: true } } },
      }),
      this.prisma.order.findMany({
        where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] }, ...serviceDateBetween(startOfLastMonth, endOfLastMonth) },
        select: { totalAmount: true, villaId: true, reservation: { select: { villaId: true } } },
      }),
      this.prisma.villa.findMany({ select: { id: true, currency: true } }),
      // Stays under way today (arrival ≤ today ≤ departure), not every confirmed booking.
      this.prisma.reservation.findMany({
        where: { status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, checkIn: { lte: today }, checkOut: { gte: today } },
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

    // Revenue per currency: dirhams and euros are never added together.
    const villaCur = new Map(villaRows.map((v) => [v.id, v.currency || DEFAULT_CURRENCY]));
    const thisMonth = totalsByCurrency(monthOrders, (o) => orderCurrency(villaCur, o), (o) => o.totalAmount);
    const lastMonth = totalsByCurrency(lastMonthOrders, (o) => orderCurrency(villaCur, o), (o) => o.totalAmount);
    const revenueByCurrency = [...new Set([...thisMonth, ...lastMonth].map((t) => t.currency))]
      .map((currency) => {
        const amount = thisMonth.find((t) => t.currency === currency)?.amount ?? 0;
        const previous = lastMonth.find((t) => t.currency === currency)?.amount ?? 0;
        return { currency, amount, previous, change: previous > 0 ? Math.round(((amount - previous) / previous) * 100) : 0 };
      })
      .sort((a, b) => b.amount - a.amount);
    // Headline figure: every currency converted to dirhams at today's rate (amounts stay
    // stored in their own currency; the per-currency figures are listed beside it).
    const q = await this.fx.quote();
    const inMad = (list: { currency: string; amount: number }[]) =>
      list.reduce((sum, t) => sum + t.amount * (this.fx.rateOf(q, t.currency, 'MAD') ?? 0), 0);
    const allConvertible = revenueByCurrency.every((r) => this.fx.rateOf(q, r.currency, 'MAD') != null);
    const madNow = inMad(thisMonth);
    const madBefore = inMad(lastMonth);
    const main = allConvertible
      ? { currency: 'MAD', amount: madNow, change: madBefore > 0 ? Math.round(((madNow - madBefore) / madBefore) * 100) : 0 }
      : revenueByCurrency[0];
    const totalRevenue = main?.amount ?? 0;
    const revenueChange = main?.change ?? 0;

    // Occupancy tonight: active houses with a stay tonight (a house and its formulas count once).
    const activeHouses = await this.prisma.villa.count({ where: { isActive: true, parentVillaId: null } });
    const occupiedHouses = new Set(
      staysUnderWay.filter((r) => r.checkOut! > today).map((r) => r.villa.parentVillaId ?? r.villaId),
    ).size;
    const occupancyRate = activeHouses > 0 ? Math.min(100, Math.round((occupiedHouses / activeHouses) * 100)) : 0;
    const activeReservations = staysUnderWay.length;

    return {
      kpis: {
        totalRevenue,
        /** Currency of totalRevenue; the others are in revenueByCurrency. */
        revenueCurrency: main?.currency ?? DEFAULT_CURRENCY,
        /** True when totalRevenue adds every currency converted to MAD. */
        revenueConverted: allConvertible && revenueByCurrency.some((r) => r.currency !== 'MAD'),
        fx: q ? { rate: this.fx.rateOf(q, 'EUR', 'MAD'), date: q.date, source: q.source, stale: !!q.stale } : null,
        revenueByCurrency,
        revenueChange: Math.round(revenueChange),
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
