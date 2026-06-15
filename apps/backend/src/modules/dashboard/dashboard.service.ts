import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalRevenueResult,
      lastMonthRevenueResult,
      activeReservations,
      pendingOrders,
      recentReservations,
      villaCount,
      activeVillaCount,
      clientsThisMonth,
      ordersThisMonth,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
          createdAt: { gte: startOfMonth },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { totalAmount: true },
      }),
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

    const totalRevenue = totalRevenueResult._sum.totalAmount ?? 0;
    const lastMonthRevenue = lastMonthRevenueResult._sum.totalAmount ?? 0;
    const revenueChange = lastMonthRevenue > 0
      ? ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;

    const occupancyRate = villaCount > 0
      ? Math.round((activeReservations / villaCount) * 100)
      : 0;

    return {
      kpis: {
        totalRevenue,
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
