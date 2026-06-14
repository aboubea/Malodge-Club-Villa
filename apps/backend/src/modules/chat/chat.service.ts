import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    const participations = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { id: true, firstName: true, lastName: true } } },
            },
            reservation: { select: { id: true, villa: { select: { name: true } } } },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return Promise.all(
      participations.map(async (p) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: p.conversationId,
            readAt: null,
            senderId: { not: userId },
          },
        });
        return { ...p.conversation, unreadCount };
      }),
    );
  }

  async getConversation(id: string, userId: string) {
    const participation = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participation) throw new ForbiddenException('Access denied');

    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
          include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
        reservation: { select: { id: true, villa: { select: { name: true } } } },
      },
    });
  }

  async createConversation(dto: { participantIds: string[]; reservationId?: string; topic?: string }) {
    return this.prisma.conversation.create({
      data: {
        reservationId: dto.reservationId,
        topic: dto.topic,
        participants: {
          create: dto.participantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
      },
    });
  }

  async sendMessage(conversationId: string, senderId: string, content: string, type: string, fileUrl?: string) {
    const message = await this.prisma.message.create({
      data: { conversationId, senderId, content, type, fileUrl },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return message;
  }

  async markRead(conversationId: string, userId: string) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    const participations = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const conversationIds = participations.map((p) => p.conversationId);
    if (conversationIds.length === 0) return 0;
    return this.prisma.message.count({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: userId },
        readAt: null,
      },
    });
  }
}
