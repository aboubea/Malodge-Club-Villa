import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_CURRENCY } from '../../common/money';

export interface ClientRequestInput {
  reservationId?: string;
  villaId?: string;
  scheduledAt?: string;
  notes?: string;
  items: { serviceId: string; quantity: number; notes?: string }[];
}

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();

/**
 * Extras asked for by a client (no online payment yet): the server sets the price
 * (the villa's price, else the catalogue's public price, in the villa's currency),
 * the request is attached to one of the client's own stays and arrives "À confirmer"
 * for the team, who confirm it (price, provider). Whatever price the client's browser
 * sends is ignored.
 */
@Injectable()
export class ClientRequestsService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
    private notifications: NotificationsService,
  ) {}

  private async stayOf(clientId: string, reservationId?: string) {
    if (!reservationId) return null;
    const stay = await this.prisma.reservation.findFirst({
      where: { id: reservationId, clientId },
      select: { id: true, villaId: true, checkIn: true, checkOut: true, status: true, label: true },
    });
    if (!stay) throw new ForbiddenException('Ce séjour n’est pas le vôtre.');
    if (stay.status === 'CANCELLED') throw new BadRequestException('Ce séjour est annulé.');
    return stay;
  }

  /** Price of each service for a villa, in the villa's currency (null when not offered there). */
  private async prices(villaId: string | null, serviceIds?: string[]) {
    const villa = villaId ? await this.prisma.villa.findUnique({ where: { id: villaId }, select: { id: true, name: true, currency: true } }) : null;
    const currency = villa?.currency ?? DEFAULT_CURRENCY;
    const services = await this.prisma.service.findMany({
      where: { isActive: true, ...(serviceIds ? { id: { in: serviceIds } } : {}) },
      select: {
        id: true, name: true, description: true, basePrice: true, publicPrice: true, unitCost: true, unit: true, currency: true, duration: true,
        category: { select: { name: true } },
        villaServices: villaId ? { where: { villaId }, select: { customPrice: true, isActive: true } } : false,
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
    const q = await this.fx.quote();
    const convert = (amount: number | null, from: string) => {
      if (amount == null) return null;
      const f = this.fx.rateOf(q, from || DEFAULT_CURRENCY, currency);
      return f == null ? null : Math.round(amount * f * 100) / 100;
    };
    return {
      villa,
      currency,
      list: services
        .filter((s) => !(s as any).villaServices?.some((vs: any) => vs.isActive === false))
        .map((s) => {
          const custom = (s as any).villaServices?.[0]?.customPrice as number | null | undefined;
          // A price set for the villa is already in the villa's currency.
          const price = custom != null ? custom : convert(s.publicPrice ?? s.basePrice, s.currency);
          return {
            id: s.id,
            name: s.name,
            description: s.description,
            category: s.category?.name ?? null,
            unit: s.unit,
            duration: (s as any).duration ?? null,
            price,
            unitCost: convert(s.unitCost, s.currency),
          };
        })
        .filter((s) => s.price != null && s.price > 0),
    };
  }

  /** The catalogue as a client sees it for one of their stays (no costs). */
  async catalogue(clientId: string, reservationId?: string) {
    const stay = await this.stayOf(clientId, reservationId);
    const { villa, currency, list } = await this.prices(stay?.villaId ?? null);
    return { villa: villa ? { id: villa.id, name: villa.name } : null, currency, services: list.map(({ unitCost: _c, ...s }) => s) };
  }

  async request(clientId: string, input: ClientRequestInput) {
    if (!input.items?.length) throw new BadRequestException('Choisissez au moins une prestation.');
    if (input.items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 50)) throw new BadRequestException('Quantité entre 1 et 50.');
    const stay = await this.stayOf(clientId, input.reservationId);
    const villaId = stay?.villaId ?? null;
    const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (when && Number.isNaN(when.getTime())) throw new BadRequestException('Date invalide.');
    if (when && when.getTime() < Date.now() - 3600_000) throw new BadRequestException('Cette date est passée.');

    const { villa, currency, list } = await this.prices(villaId, input.items.map((i) => i.serviceId));
    const byId = new Map(list.map((s) => [s.id, s]));
    const lines = input.items.map((i) => {
      const s = byId.get(i.serviceId);
      if (!s) throw new NotFoundException('Prestation indisponible pour cette villa.');
      return { ...i, service: s, total: Math.round(s.price! * i.quantity * 100) / 100 };
    });
    const totalAmount = lines.reduce((t, l) => t + l.total, 0);
    const costKnown = lines.every((l) => l.service.unitCost != null);
    const cost = costKnown ? lines.reduce((t, l) => t + l.service.unitCost! * l.quantity, 0) : null;

    const order = await this.prisma.order.create({
      data: {
        clientId,
        reservationId: stay?.id ?? null,
        villaId,
        status: 'PENDING',
        providerStatus: 'PENDING',
        notes: input.notes?.slice(0, 1000) || null,
        scheduledAt: when,
        totalAmount,
        // Malodge's margin when the purchase cost is known, else the usual 15 %.
        commission: cost != null ? Math.round((totalAmount - cost) * 100) / 100 : Math.round(totalAmount * 0.15 * 100) / 100,
        items: {
          create: lines.map((l) => ({
            serviceId: l.service.id,
            quantity: l.quantity,
            unitPrice: l.service.price!,
            unitCost: l.service.unitCost,
            total: l.total,
            notes: l.notes?.slice(0, 500) || null,
          })),
        },
      },
      select: { id: true, status: true, totalAmount: true, scheduledAt: true },
    });

    await this.tellTeam(clientId, lines.map((l) => (l.quantity > 1 ? `${l.service.name} × ${l.quantity}` : l.service.name)).join(', '), villa?.name ?? null, order.id);
    return { ...order, currency };
  }

  /** The client's requests (all their stays), newest first. */
  async mine(clientId: string) {
    const orders = await this.prisma.order.findMany({
      where: { clientId },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true, status: true, scheduledAt: true, totalAmount: true, createdAt: true, notes: true, reservationId: true, villaId: true,
        items: { select: { quantity: true, label: true, service: { select: { name: true, category: { select: { name: true } } } } } },
        reservation: { select: { villa: { select: { currency: true } } } },
      },
    });
    const villaCur = new Map(
      (await this.prisma.villa.findMany({ where: { id: { in: orders.map((o) => o.villaId).filter(Boolean) as string[] } }, select: { id: true, currency: true } })).map((v) => [v.id, v.currency]),
    );
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      scheduledAt: o.scheduledAt,
      createdAt: o.createdAt,
      reservationId: o.reservationId,
      total: o.totalAmount,
      currency: villaCur.get(o.villaId ?? '') ?? o.reservation?.villa?.currency ?? DEFAULT_CURRENCY,
      notes: o.notes,
      items: o.items.map((i) => ({ name: i.service?.name ?? i.label ?? 'Prestation', category: i.service?.category?.name ?? null, quantity: i.quantity })),
    }));
  }

  private async tellTeam(clientId: string, what: string, villa: string | null, orderId: string) {
    try {
      const client = await this.prisma.user.findUnique({ where: { id: clientId }, select: { firstName: true, lastName: true } });
      const staff = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] }, isActive: true }, select: { id: true }, take: 20 });
      for (const s of staff) {
        await this.notifications.send(s.id, `Demande d’extra : ${what}`, `${fullName(client)}${villa ? ` · ${villa}` : ''} — à confirmer.`, 'info', 'in_app', orderId, 'order');
      }
    } catch {
      /* the request is saved even if the notification fails */
    }
  }
}
