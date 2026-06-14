import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@mahodge/shared';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    villaId?: string;
    clientId?: string;
    search?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }
    if (params.villaId) {
      where.villaId = params.villaId;
    }
    if (params.clientId) {
      where.clientId = params.clientId;
    }
    if (params.search) {
      where.OR = [
        { client: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { client: { lastName: { contains: params.search, mode: 'insensitive' } } },
        { client: { email: { contains: params.search, mode: 'insensitive' } } },
        { reservation: { villa: { name: { contains: params.search, mode: 'insensitive' } } } },
        { items: { some: { service: { name: { contains: params.search, mode: 'insensitive' } } } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          provider: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          reservation: { include: { villa: { select: { id: true, name: true } } } },
          items: { include: { service: { select: { id: true, name: true } } } },
          payment: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
        provider: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          },
        },
        reservation: { include: { villa: true } },
        items: {
          include: {
            service: { include: { category: true } },
          },
        },
        payment: true,
      },
    });

    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async create(dto: CreateOrderDto) {
    const { items, ...orderData } = dto;

    // Calculate totals
    const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const commissionRate = orderData.commission ?? 15;
    const commissionAmount = (totalAmount * commissionRate) / 100;

    const order = await this.prisma.order.create({
      data: {
        ...orderData,
        totalAmount,
        commission: commissionAmount,
        scheduledAt: orderData.scheduledAt ? new Date(orderData.scheduledAt) : undefined,
        items: {
          create: items.map((item) => ({
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.unitPrice * item.quantity,
            notes: item.notes,
          })),
        },
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        items: { include: { service: true } },
        payment: true,
      },
    });

    return order;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.findOne(id);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot update status of a cancelled order');
    }

    const updateData: any = { status };
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    return this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { service: true } },
        payment: true,
      },
    });
  }

  async assignProvider(id: string, providerId: string) {
    await this.findOne(id);

    const provider = await this.prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);

    return this.prisma.order.update({
      where: { id },
      data: { providerId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        provider: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        items: { include: { service: true } },
      },
    });
  }

  async cancel(id: string) {
    const order = await this.findOne(id);

    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed order');
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async getStats() {
    const [total, byStatus, revenueResult] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true, commission: true },
        where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] } },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      byStatus.map((s) => [s.status, s._count.id]),
    );

    return {
      total,
      byStatus: {
        PENDING: statusCounts['PENDING'] || 0,
        CONFIRMED: statusCounts['CONFIRMED'] || 0,
        IN_PROGRESS: statusCounts['IN_PROGRESS'] || 0,
        COMPLETED: statusCounts['COMPLETED'] || 0,
        CANCELLED: statusCounts['CANCELLED'] || 0,
      },
      totalRevenue: revenueResult._sum.totalAmount || 0,
      totalCommissions: revenueResult._sum.commission || 0,
    };
  }
}
