import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentMethod } from '@malodge/shared';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async createPayment(dto: CreatePaymentDto) {
    // Check that order exists
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);

    // Check if payment already exists
    const existing = await this.prisma.payment.findUnique({ where: { orderId: dto.orderId } });
    if (existing) throw new BadRequestException('Payment already exists for this order');

    const payment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        method: dto.method,
        amount: dto.amount,
        status: 'PENDING',
      },
      include: { order: true },
    });

    // Auto-process based on method
    if (dto.method === PaymentMethod.CASH) {
      return this.processCash(payment.id);
    }
    if (dto.method === PaymentMethod.CARD) {
      return this.processCard(payment.id);
    }
    if (dto.method === PaymentMethod.TRANSFER || dto.method === PaymentMethod.MANUAL) {
      return this.processTransfer(payment.id);
    }

    return payment;
  }

  async processCard(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    // Stripe stub — in production this would call Stripe API
    const stripeIntentId = `pi_stub_${Date.now()}`;
    console.log(`[Stripe] Creating payment intent for payment ${paymentId}, amount: ${payment.amount}€, intent: ${stripeIntentId}`);

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PENDING',
        stripePaymentId: stripeIntentId,
      },
      include: { order: true },
    });
  }

  async processCash(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
      include: { order: true },
    });
  }

  async processTransfer(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    // Transfer stays PENDING until admin confirms
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING' },
      include: { order: true },
    });
  }

  async confirmPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    if (payment.status === 'PAID') {
      throw new BadRequestException('Payment is already confirmed');
    }

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
      include: { order: true },
    });
  }

  async refund(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    if (payment.status !== 'PAID') {
      throw new BadRequestException('Only paid payments can be refunded');
    }

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
      include: { order: true },
    });
  }

  async findByOrder(orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: { order: { include: { client: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    if (!payment) throw new NotFoundException(`No payment found for order ${orderId}`);
    return payment;
  }
}
