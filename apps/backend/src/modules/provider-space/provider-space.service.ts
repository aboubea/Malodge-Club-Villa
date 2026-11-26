import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ExtrasService } from '../extras/extras.service';
import { NotificationsService } from '../notifications/notifications.service';
import { appSecret, signLink } from '../../common/security/secrets';
import { DEFAULT_CURRENCY } from '../../common/money';

/**
 * The provider's own space (drivers, masseuses…), on their phone:
 *  - opened from a personal link sent by WhatsApp (no password): "<id>.<version>.<signature>",
 *    revoked by raising the provider's accessVersion;
 *  - or with their account (role PROVIDER) when they have one.
 * They see their missions with THEIR price (purchase cost), never the client price or
 * the margin; they accept, refuse, and mark a mission done; they see what they were paid.
 */

export function providerToken(providerId: string, version: number) {
  return `${providerId}.${version}.${signLink(`provider:${providerId}:${version}`)}`;
}

export function parseProviderToken(token: string | undefined | null): { providerId: string; version: number } | null {
  const m = /^([a-z0-9]+)\.(\d{1,6})\.([A-Za-z0-9_-]{20,64})$/.exec(token ?? '');
  if (!m) return null;
  const version = Number(m[2]);
  return signLink(`provider:${m[1]}:${version}`) === m[3] ? { providerId: m[1], version } : null;
}

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
const DAY = 86_400_000;

export interface ProviderRef {
  id: string;
  userId: string;
  firstName: string;
}

@Injectable()
export class ProviderSpaceService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
    private extras: ExtrasService,
    private notifications: NotificationsService,
  ) {}

  /* ───────────── Staff: the link to send ───────────── */

  async linkFor(providerId: string) {
    const p = await this.prisma.provider.findUnique({ where: { id: providerId }, include: { user: { select: { firstName: true, phone: true } } } });
    if (!p) throw new NotFoundException('Prestataire introuvable');
    const url = `${this.mail.appUrl}/prestataire/${providerToken(p.id, p.accessVersion)}`;
    const phone = (p.user.phone ?? '').replace(/[^0-9]/g, '');
    const text = [
      `Bonjour ${p.user.firstName},`,
      '',
      'Voici votre espace Malodge Club : vos missions du jour et à venir, à accepter ou refuser, et vos règlements.',
      url,
      '',
      'Astuce : ajoutez-le à l’écran d’accueil de votre téléphone. Ce lien est personnel, ne le partagez pas.',
    ].join('\n');
    return { url, whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null, hasPhone: !!phone, version: p.accessVersion };
  }

  /** Every link sent so far stops working; a new one can be sent. */
  async revoke(providerId: string) {
    const p = await this.prisma.provider.update({ where: { id: providerId }, data: { accessVersion: { increment: 1 } } }).catch(() => null);
    if (!p) throw new NotFoundException('Prestataire introuvable');
    return { revoked: true, version: p.accessVersion };
  }

  /* ───────────── Provider: who is calling ───────────── */

  async resolve(key: string | undefined, authorization: string | undefined): Promise<ProviderRef> {
    if (key) {
      const t = parseProviderToken(key);
      const p = t && (await this.prisma.provider.findUnique({ where: { id: t.providerId }, include: { user: { select: { firstName: true, isActive: true } } } }));
      if (!p || p.accessVersion !== t!.version || !p.isActive || !p.user.isActive) {
        throw new UnauthorizedException('Lien expiré ou désactivé : demandez un nouveau lien à Malodge.');
      }
      return { id: p.id, userId: p.userId, firstName: p.user.firstName };
    }
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (bearer) {
      let payload: { sub: string; role: string } | null = null;
      try {
        payload = this.jwt.verify(bearer, { secret: appSecret('access') });
      } catch {
        payload = null;
      }
      if (payload?.role === 'PROVIDER') {
        const p = await this.prisma.provider.findUnique({ where: { userId: payload.sub }, include: { user: { select: { firstName: true, isActive: true } } } });
        if (p && p.isActive && p.user.isActive) return { id: p.id, userId: p.userId, firstName: p.user.firstName };
      }
    }
    throw new UnauthorizedException('Ouvrez le lien reçu par WhatsApp, ou connectez-vous avec votre compte prestataire.');
  }

  /* ───────────── Provider: missions and payments ───────────── */

  async overview(provider: ProviderRef) {
    const since = new Date(Date.now() - 30 * DAY);
    const orders = await this.prisma.order.findMany({
      where: {
        providerId: provider.id,
        status: { not: 'CANCELLED' },
        OR: [{ scheduledAt: { gte: since } }, { scheduledAt: null, createdAt: { gte: since } }],
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, status: true, providerStatus: true, scheduledAt: true, completedAt: true, notes: true, villaId: true,
        items: { select: { label: true, quantity: true, unitCost: true, service: { select: { name: true, category: { select: { name: true } } } } } },
        reservation: {
          select: { label: true, guests: true, checkIn: true, checkOut: true, villaId: true, client: { select: { firstName: true, lastName: true } } },
        },
        client: { select: { firstName: true, lastName: true } },
      },
    });
    const villaIds = [...new Set(orders.map((o) => o.villaId ?? o.reservation?.villaId).filter(Boolean) as string[])];
    const villas = new Map(
      (await this.prisma.villa.findMany({ where: { id: { in: villaIds } }, select: { id: true, name: true, city: true, address: true, currency: true, latitude: true, longitude: true } })).map((v) => [v.id, v]),
    );
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);

    const missions = orders.map((o) => {
      const villa = villas.get(o.villaId ?? o.reservation?.villaId ?? '') ?? null;
      const known = o.items.length > 0 && o.items.every((i) => i.unitCost != null);
      const respondable = o.providerStatus === 'PENDING' && !['COMPLETED', 'CANCELLED'].includes(o.status);
      return {
        id: o.id,
        date: o.scheduledAt,
        status: o.status,
        providerStatus: o.providerStatus,
        items: o.items.map((i) => ({ label: i.service?.name ?? i.label ?? 'Prestation', category: i.service?.category?.name ?? null, quantity: i.quantity })),
        // Their own price only (purchase cost), never the client's.
        amount: known ? o.items.reduce((t, i) => t + i.quantity * (i.unitCost as number), 0) : null,
        currency: villa?.currency ?? DEFAULT_CURRENCY,
        villa: villa ? { name: villa.name, city: villa.city, address: villa.address, mapsUrl: mapsUrl(villa) } : null,
        guest: o.reservation?.label || fullName(o.reservation?.client) || fullName(o.client) || null,
        guests: o.reservation?.guests ?? null,
        notes: o.notes,
        canRespond: respondable,
        canComplete: o.providerStatus === 'ACCEPTED' && ['CONFIRMED', 'IN_PROGRESS', 'PENDING'].includes(o.status) && (!o.scheduledAt || o.scheduledAt <= endOfToday),
      };
    });

    // Payments: the provider's extras account (what their missions cost, what was paid).
    const me = await this.extras.me({ id: provider.userId, role: 'PROVIDER', countries: [] } as any);
    const account = {
      balances: (me.accounts ?? []).map((a: any) => ({ currency: a.currency, due: a.due, paid: a.paid, balance: a.balance, state: a.state })),
      payments: (me.settlements ?? [])
        .filter((s: any) => s.status === 'VALIDATED')
        .slice(0, 30)
        .map((s: any) => ({ date: s.date, label: s.kindLabel, amount: s.amount, currency: s.currency, method: s.method })),
    };

    return { provider: { firstName: provider.firstName }, missions, account };
  }

  private async mission(provider: ProviderRef, orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, providerId: true, status: true, providerStatus: true, scheduledAt: true } });
    if (!o || o.providerId !== provider.id) throw new NotFoundException('Mission introuvable');
    return o;
  }

  async respond(provider: ProviderRef, orderId: string, action: 'accept' | 'reject') {
    if (!['accept', 'reject'].includes(action)) throw new BadRequestException('Réponse attendue : accept ou reject');
    const o = await this.mission(provider, orderId);
    if (['COMPLETED', 'CANCELLED'].includes(o.status)) throw new BadRequestException('Cette mission est terminée ou annulée.');
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { providerStatus: action === 'accept' ? 'ACCEPTED' : 'REJECTED', ...(action === 'accept' && o.status === 'PENDING' ? { status: 'CONFIRMED' } : {}) },
      select: { id: true, status: true, providerStatus: true },
    });
    await this.tellTeam(`${provider.firstName} a ${action === 'accept' ? 'accepté' : 'refusé'} une mission`, orderId, action === 'reject');
    return updated;
  }

  async complete(provider: ProviderRef, orderId: string) {
    const o = await this.mission(provider, orderId);
    if (o.providerStatus !== 'ACCEPTED') throw new BadRequestException('Acceptez d’abord la mission.');
    if (o.status === 'CANCELLED') throw new BadRequestException('Mission annulée.');
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', completedAt: new Date() }, select: { id: true, status: true, providerStatus: true } });
    await this.tellTeam(`${provider.firstName} a terminé une mission`, orderId, false);
    return updated;
  }

  /** In-app notification to the team (a refusal needs someone else to be found). */
  private async tellTeam(title: string, orderId: string, urgent: boolean) {
    try {
      const staff = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] }, isActive: true }, select: { id: true }, take: 20 });
      for (const s of staff) await this.notifications.send(s.id, title, urgent ? 'Un autre prestataire est à trouver.' : 'Voir la commande.', urgent ? 'warning' : 'info', 'in_app', orderId, 'order');
    } catch {
      /* the answer is saved even if the notification fails */
    }
  }
}

function mapsUrl(v: { address: string; city: string; latitude: number | null; longitude: number | null }) {
  const q = v.latitude != null && v.longitude != null ? `${v.latitude},${v.longitude}` : [v.address, v.city].filter((x) => x && x !== '-').join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
