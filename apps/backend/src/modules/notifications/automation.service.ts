import { Injectable } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class AutomationService {
  constructor(private notifications: NotificationsService) {}

  async onReservationConfirmed(reservation: any) {
    await this.notifications.send(
      reservation.clientId,
      'Réservation confirmée',
      `Votre réservation à ${reservation.villa?.name || 'la villa'} est confirmée pour le ${new Date(reservation.checkIn).toLocaleDateString('fr-FR')}.`,
      'success',
      'in_app',
      reservation.id,
      'reservation',
    );
  }

  async onOrderStatusChanged(order: any, newStatus: string) {
    const statusLabels: Record<string, string> = {
      CONFIRMED: 'confirmée',
      IN_PROGRESS: 'en cours',
      COMPLETED: 'terminée',
      CANCELLED: 'annulée',
    };
    const label = statusLabels[newStatus] || newStatus.toLowerCase();
    await this.notifications.send(
      order.clientId,
      'Statut de commande mis à jour',
      `Votre commande est maintenant ${label}.`,
      newStatus === 'CANCELLED' ? 'warning' : 'info',
      'in_app',
      order.id,
      'order',
    );
  }

  async onOrderAssignedToProvider(order: any, provider: any) {
    if (provider?.userId) {
      await this.notifications.send(
        provider.userId,
        'Nouvelle mission assignée',
        `Une nouvelle commande vous a été assignée.`,
        'info',
        'in_app',
        order.id,
        'order',
      );
    }
  }

  async onPaymentConfirmed(order: any) {
    await this.notifications.send(
      order.clientId,
      'Paiement reçu',
      `Votre paiement pour la commande a été confirmé.`,
      'success',
      'in_app',
      order.id,
      'order',
    );
  }

  async onNewMessage(message: any, recipientIds: string[]) {
    for (const recipientId of recipientIds) {
      if (recipientId !== message.senderId) {
        await this.notifications.send(
          recipientId,
          'Nouveau message',
          `${message.sender?.firstName || 'Quelqu\'un'} vous a envoyé un message.`,
          'info',
          'in_app',
          message.conversationId,
          'conversation',
        );
      }
    }
  }
}
