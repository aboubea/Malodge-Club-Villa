import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_CURRENCY, orderCurrency, serviceDateBetween, totalsByCurrency } from '../../common/money';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      monthOrders,
      lastMonthOrders,
      villaRows,
      activeReservations,
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
      this.prisma.reservation.count({
        where: { status: { in: ['CONFIRMED', 'ACTIVE'] } },
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
    const main = revenueByCurrency[0];
    const totalRevenue = main?.amount ?? 0;
    const revenueChange = main?.change ?? 0;

    const occupancyRate = villaCount > 0
      ? Math.round((activeReservations / villaCount) * 100)
      : 0;

    return {
      kpis: {
        totalRevenue,
        /** Currency of totalRevenue; the others are in revenueByCurrency. */
        revenueCurrency: main?.currency ?? DEFAULT_CURRENCY,
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
