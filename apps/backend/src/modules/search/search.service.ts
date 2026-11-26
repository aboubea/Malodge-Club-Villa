import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { score } from './search';

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
const realEmail = (e?: string | null) => (e && !/\.(local|invalid)$/i.test(e) ? e : null);
const LIMIT = 6;

export interface Hit {
  type: 'stay' | 'villa' | 'extra' | 'person' | 'service';
  id: string;
  title: string;
  subtitle: string;
  /** Where to go in the app. */
  url: string;
  score: number;
}

/** Global search (Ctrl+K) for the staff: stays, villas, extras, people, catalogue. */
@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, actor: { role: string; countries?: string[] }) {
    const query = q.trim().slice(0, 80);
    if (query.length < 2) return { query, results: [] as Hit[] };
    const countries = actor.role !== 'SUPER_ADMIN' && actor.countries?.length ? actor.countries : null;
    const villaWhere = countries ? { country: { in: countries } } : {};
    const day = (d: Date | null) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '?');
    const today = Date.now();

    const villas = await this.prisma.villa.findMany({ where: villaWhere, select: { id: true, name: true, city: true, country: true, isActive: true, parentVillaId: true, owner: { select: { firstName: true, lastName: true } } } });
    const villaName = new Map(villas.map((v) => [v.id, v.name]));
    const [stays, items, people, services] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { villa: villaWhere },
        select: {
          id: true, label: true, checkIn: true, checkOut: true, status: true, logifyId: true,
          villa: { select: { name: true } },
          client: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      }),
      this.prisma.orderItem.findMany({
        where: countries ? { order: { OR: [{ villaId: null }, { villaId: { in: villas.map((v) => v.id) } }] } } : {},
        select: {
          id: true, label: true,
          service: { select: { name: true } },
          order: { select: { id: true, status: true, scheduledAt: true, reservationId: true, villaId: true, reservation: { select: { label: true, villaId: true, client: { select: { firstName: true, lastName: true } } } } } },
        },
        take: 3000,
        orderBy: { order: { createdAt: 'desc' } },
      }),
      this.prisma.user.findMany({
        where: { role: { in: ['OWNER', 'EMPLOYEE', 'PROVIDER', 'CLIENT'] } },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, reservations: { select: { id: true }, orderBy: { checkIn: 'desc' }, take: 1 } },
      }),
      this.prisma.service.findMany({ select: { id: true, name: true, category: { select: { name: true } } } }),
    ]);

    const hits: Hit[] = [];
    for (const v of villas) {
      const s = score(query, [v.name, v.city]);
      if (s) hits.push({ type: 'villa', id: v.id, title: v.name, subtitle: [v.city, v.owner ? `propriétaire ${fullName(v.owner)}` : null, v.isActive ? null : 'inactive'].filter(Boolean).join(' · '), url: `/villas/${v.parentVillaId ?? v.id}`, score: s });
    }
    for (const r of stays) {
      const guest = r.label || fullName(r.client) || 'Client';
      const byGuest = score(query, [guest, fullName(r.client), realEmail(r.client?.email), r.client?.phone, r.logifyId]);
      const all = byGuest || score(query, [guest, fullName(r.client), r.villa?.name]);
      if (!all) continue;
      // Found only through the villa's name: below the villa itself.
      const s = byGuest ? all : all - 1.5;
      // Stays under way or near today first.
      const near = r.checkIn ? Math.abs(r.checkIn.getTime() - today) / 86_400_000 : 9_999;
      hits.push({ type: 'stay', id: r.id, title: guest, subtitle: `${r.villa?.name ?? '—'} · ${day(r.checkIn)} → ${day(r.checkOut)}${r.status === 'CANCELLED' ? ' · annulée' : ''}`, url: `/reservations?stay=${r.id}`, score: s + Math.max(0, 1 - near / 365) });
    }
    for (const i of items) {
      const label = i.service?.name ?? i.label ?? 'Prestation';
      const stay = i.order.reservation ? i.order.reservation.label || fullName(i.order.reservation.client) : null;
      const s = score(query, [label]);
      if (!s) continue;
      hits.push({
        type: 'extra',
        id: i.id,
        title: label,
        subtitle: [stay, villaName.get(i.order.villaId ?? i.order.reservation?.villaId ?? ''), i.order.scheduledAt ? day(i.order.scheduledAt) : 'sans date'].filter(Boolean).join(' · '),
        url: i.order.reservationId ? `/extras/saisie?stayId=${i.order.reservationId}&stays=all` : `/extras/saisie?search=${encodeURIComponent(label)}&stays=all`,
        score: s - 0.5,
      });
    }
    const ROLE: Record<string, string> = { OWNER: 'Propriétaire', EMPLOYEE: 'Salarié', PROVIDER: 'Prestataire', CLIENT: 'Client' };
    for (const p of people) {
      const name = fullName(p);
      const s = score(query, [name, realEmail(p.email), p.phone]);
      if (!s) continue;
      const url =
        p.role === 'CLIENT' ? (p.reservations[0] ? `/reservations?stay=${p.reservations[0].id}` : '/reservations')
        : p.role === 'PROVIDER' ? `/extras/comptes?role=PROVIDER`
        : `/extras/comptes?role=${p.role}`;
      hits.push({ type: 'person', id: p.id, title: name || realEmail(p.email) || '—', subtitle: [ROLE[p.role], realEmail(p.email), p.phone].filter(Boolean).join(' · '), url, score: s });
    }
    for (const sv of services) {
      const s = score(query, [sv.name, sv.category?.name]);
      if (s) hits.push({ type: 'service', id: sv.id, title: sv.name, subtitle: `Catalogue · ${sv.category?.name ?? ''}`, url: `/extras/catalogue?search=${encodeURIComponent(sv.name)}`, score: s - 0.3 });
    }

    // The best of each kind, a few per kind; extras of the same name only once.
    const seenExtra = new Set<string>();
    const byType = new Map<string, Hit[]>();
    for (const h of hits.sort((a, b) => b.score - a.score)) {
      if (h.type === 'extra') {
        const k = `${h.title}|${h.url}`;
        if (seenExtra.has(k)) continue;
        seenExtra.add(k);
      }
      const list = byType.get(h.type) ?? [];
      if (list.length < LIMIT) list.push(h);
      byType.set(h.type, list);
    }
    return { query, results: [...byType.values()].flat() };
  }
}
