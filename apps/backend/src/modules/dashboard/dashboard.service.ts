import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      revenueThisMonth,
      revenueLastMonth,
      serviceRevenueThisMonth,
      serviceRevenueLastMonth,
      activeReservations,
      pendingOrders,
      pendingOrdersLastMonth,
      recentReservations,
      totalVillas,
      activeVillas,
      uniqueClientsThisMonth,
      ordersThisMonth,
      ordersLastMonth,
      villaRevenues,
    ] = await Promise.all([
      // CA Global this month (completed/in-progress orders)
      this.prisma.order.aggregate({
        where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] }, createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      // CA Global last month
      this.prisma.order.aggregate({
        where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] }, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { totalAmount: true },
      }),
      // CA Services (order items) this month
      this.prisma.orderItem.aggregate({
        where: { order: { status: { in: ['COMPLETED', 'IN_PROGRESS'] }, createdAt: { gte: monthStart } } },
        _sum: { total: true },
      }),
      // CA Services last month
      this.prisma.orderItem.aggregate({
        where: { order: { status: { in: ['COMPLETED', 'IN_PROGRESS'] }, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } },
        _sum: { total: true },
      }),
      // Active stays
      this.prisma.reservation.count({ where: { status: 'ACTIVE' } }),
      // Pending/confirmed orders
      this.prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] } } }),
      // Pending/confirmed orders last month (for change calc)
      this.prisma.order.count({
        where: { status: { in: ['PENDING', 'CONFIRMED'] }, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
      // Recent reservations (last 5)
      this.prisma.reservation.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { firstName: true, lastName: true } },
          villa: { select: { name: true, city: true } },
        },
      }),
      // Total villas
      this.prisma.villa.count(),
      // Active villas
      this.prisma.villa.count({ where: { isActive: true } }),
      // Unique clients with reservations this month
      this.prisma.reservation.groupBy({
        by: ['clientId'],
        where: { createdAt: { gte: monthStart } },
      }),
      // Orders count this month
      this.prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
      // Orders count last month
      this.prisma.order.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      // Villa revenues: group reservations by villa
      this.prisma.reservation.groupBy({
        by: ['villaId'],
        where: { status: { in: ['ACTIVE', 'COMPLETED', 'CONFIRMED'] }, createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 5,
      }),
    ]);

    // Compute KPIs
    const totalRevenue = revenueThisMonth._sum.totalAmount ?? 0;
    const lastMonthRevenue = revenueLastMonth._sum.totalAmount ?? 0;
    const revenueChange = lastMonthRevenue > 0
      ? Math.round(((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 1000) / 10
      : 0;

    const serviceRevenue = serviceRevenueThisMonth._sum.total ?? 0;
    const lastMonthServiceRevenue = serviceRevenueLastMonth._sum.total ?? 0;
    const serviceRevenueChange = lastMonthServiceRevenue > 0
      ? Math.round(((serviceRevenue - lastMonthServiceRevenue) / lastMonthServiceRevenue) * 1000) / 10
      : 0;

    const occupancyRate = activeVillas > 0
      ? Math.min(100, Math.round((activeReservations / activeVillas) * 100))
      : 0;

    const ordersChange = ordersLastMonth > 0
      ? Math.round(((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 1000) / 10
      : 0;

    // Fetch villa details for top villas
    const villaIds = villaRevenues.map((v) => v.villaId);
    const villas = villaIds.length > 0
      ? await this.prisma.villa.findMany({
          where: { id: { in: villaIds } },
          select: { id: true, name: true, city: true },
        })
      : [];

    const villaMap = new Map(villas.map((v) => [v.id, v]));
    const topVillas = villaRevenues
      .map((vr) => {
        const villa = villaMap.get(vr.villaId);
        if (!villa) return null;
        const revenue = vr._sum.totalAmount ?? 0;
        return {
          id: villa.id,
          name: villa.name,
          city: villa.city,
          revenue,
          reservations: vr._count.id,
          occupancy: activeVillas > 0 ? Math.min(100, Math.round((vr._count.id / Math.max(1, vr._count.id)) * (revenue / Math.max(1, totalRevenue)) * 100)) : 0,
        };
      })
      .filter(Boolean) as { id: string; name: string; city: string; revenue: number; reservations: number; occupancy: number }[];

    return {
      kpis: {
        totalRevenue,
        revenueChange,
        serviceRevenue,
        serviceRevenueChange,
        occupancyRate,
        activeReservations,
        pendingOrders,
        pendingOrdersChange: pendingOrdersLastMonth > 0
          ? Math.round(((pendingOrders - pendingOrdersLastMonth) / pendingOrdersLastMonth) * 1000) / 10
          : 0,
        activeVillas,
        totalVillas,
        activeClients: uniqueClientsThisMonth.length,
        ordersThisMonth,
        ordersChange,
      },
      recentReservations: recentReservations.map((r) => ({
        id: r.id,
        client: { firstName: r.client.firstName, lastName: r.client.lastName },
        villa: r.villa.name,
        checkIn: r.checkIn.toISOString(),
        checkOut: r.checkOut.toISOString(),
        status: r.status,
        amount: r.totalAmount,
      })),
      topVillas,
    };
  }
}
