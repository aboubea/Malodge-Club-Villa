import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { TwilioService } from './twilio.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private twilioService: TwilioService,
  ) {}

  // ChatGateway is injected lazily to avoid circular dependency
  private chatGateway: any;

  setChatGateway(gateway: any) {
    this.chatGateway = gateway;
  }

  async send(
    userId: string,
    title: string,
    body: string,
    type: string = 'info',
    channel: string = 'in_app',
    entityId?: string,
    entityType?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, body, type, channel, entityId, entityType },
    });

    // In-app: emit via socket
    if (channel === 'in_app' && this.chatGateway) {
      this.chatGateway.emitToUser(userId, 'notification', notification);
    }

    // Email
    if (channel === 'email') {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        // Use mail service generic send - stub approach
        this.mailService.sendWelcome(user.email, user.firstName).catch(() => {});
      }
    }

    // SMS / WhatsApp
    if (channel === 'sms' || channel === 'whatsapp') {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.phone) {
        if (channel === 'sms') {
          await this.twilioService.sendSms(user.phone, `${title}: ${body}`);
        } else {
          await this.twilioService.sendWhatsApp(user.phone, `${title}: ${body}`);
        }
      }
    }

    return notification;
  }

  async findAll(userId: string, unreadOnly = false, page = 1, limit = 20) {
    const where: any = { userId };
    if (unreadOnly) where.isRead = false;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async markRead(id: string, userId: string) {
    const notif = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }
}
