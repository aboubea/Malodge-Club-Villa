import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@malodge/shared';

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
        items: {
          include: {
            service: {
              include: {
                providers: {
                  where: { isPreferred: true },
                  include: { provider: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } } },
                  take: 1,
                },
              },
            },
          },
        },
        reservation: { include: { villa: { select: { name: true, city: true } } } },
        payment: true,
      },
    });

    // Build WhatsApp URL for the preferred provider of the first service
    const whatsappUrl = this.buildWhatsappUrl(order);

    return { ...order, whatsappUrl };
  }

  private buildWhatsappUrl(order: any): string | null {
    const firstItem = order.items?.[0];
    if (!firstItem) return null;

    const preferredSp = firstItem.service?.providers?.[0];
    if (!preferredSp?.provider?.user?.phone) return null;

    const provider = preferredSp.provider;
    const phone = provider.user.phone.replace(/[^0-9]/g, '');
    const providerName = `${provider.user.firstName} ${provider.user.lastName}`;
    const serviceName = firstItem.service?.name || 'Service';
    const villa = order.reservation?.villa;
    const villaName = villa ? `${villa.name} — ${villa.city}` : 'votre villa';
    const dateStr = order.scheduledAt
      ? new Date(order.scheduledAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
      : 'à convenir';
    const appUrl = process.env['APP_URL'] || 'https://malodge.vercel.app';

    const message = [
      `Bonjour ${providerName},`,
      '',
      `Nouvelle demande de prestation :`,
      `✦ Service : ${serviceName}`,
      `🏠 Villa : ${villaName}`,
      `📅 Date : ${dateStr}`,
      `💰 Montant : ${order.totalAmount?.toFixed(2)} €`,
      '',
      `Confirmez votre disponibilité :`,
      `✅ Accepter : ${appUrl}/confirmer?orderId=${order.id}&action=accept`,
      `❌ Refuser : ${appUrl}/confirmer?orderId=${order.id}&action=reject`,
      '',
      `Malodge Club Villa`,
    ].join('\n');

    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  async providerRespond(orderId: string, action: 'accept' | 'reject') {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const providerStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
    const statusUpdate = action === 'accept' ? { status: 'CONFIRMED' as any } : {};

    return this.prisma.order.update({
      where: { id: orderId },
      data: { providerStatus, ...statusUpdate },
      select: { id: true, providerStatus: true, status: true },
    });
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
