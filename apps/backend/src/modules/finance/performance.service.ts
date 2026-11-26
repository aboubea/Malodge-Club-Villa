import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { DEFAULT_CURRENCY, providerCost, reservationCurrency, serviceDateBetween } from '../../common/money';
import { houseMetrics, Metrics, OrderIn, PeriodRange, periodsFor, StayIn, sumMetrics } from './performance';

type Kind = 'month' | 'quarter' | 'year';
const REPORT_CURRENCY = 'MAD';
const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || '—';

export interface Group {
  revenue: number;
  cost: number;
  costKnown: boolean;
  count: number;
}
const emptyGroup = (): Group => ({ revenue: 0, cost: 0, costKnown: true, count: 0 });

/**
 * Performance per house (a house and its Lodgify formulas count as one), for a month,
 * a quarter or a year, compared with the same span one year earlier. Everything is
 * converted to dirhams at today's rate, for both years, so the comparison is not
 * distorted by the exchange rate.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
  ) {}

  async report(kind: Kind, date: Date, countries: string[] | null = null) {
    const { current, previous, complete } = periodsFor(kind, date);
    const q = await this.fx.quote();
    const unconverted = new Set<string>();
    const toMad = (amount: number, currency: string): number | null => {
      const f = this.fx.rateOf(q, currency || DEFAULT_CURRENCY, REPORT_CURRENCY);
      if (f == null) {
        unconverted.add(currency);
        return null;
      }
      return amount * f;
    };

    const villas = await this.prisma.villa.findMany({
      where: countries?.length ? { country: { in: countries } } : {},
      select: { id: true, name: true, city: true, country: true, currency: true, isActive: true, parentVillaId: true, logifyId: true },
    });
    const houseOf = new Map(villas.map((v) => [v.id, v.parentVillaId ?? v.id]));
    const villaIds = villas.map((v) => v.id);
    const overlap = (r: PeriodRange) => ({ checkIn: { lte: r.end }, checkOut: { gt: r.start } });

    const [reservations, orders] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { villaId: { in: villaIds }, status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, OR: [overlap(current), overlap(previous)] },
        select: { id: true, villaId: true, checkIn: true, checkOut: true, totalAmount: true, currency: true, villa: { select: { currency: true } } },
      }),
      this.prisma.order.findMany({
        where: {
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
          AND: [{ OR: [serviceDateBetween(current.start, current.end), serviceDateBetween(previous.start, previous.end)] }],
        },
        select: {
          id: true, villaId: true, totalAmount: true, commission: true, scheduledAt: true, completedAt: true, createdAt: true,
          reservation: { select: { villaId: true } },
          provider: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          items: { select: { serviceId: true, label: true, quantity: true, total: true, unitCost: true, service: { select: { name: true, category: { select: { name: true } } } } } },
        },
      }),
    ]);

    const villaCurrency = new Map(villas.map((v) => [v.id, v.currency || DEFAULT_CURRENCY]));
    const inRange = (d: Date, r: PeriodRange) => d >= r.start && d <= r.end;
    const serviceDay = (o: (typeof orders)[number]) => o.scheduledAt ?? o.completedAt ?? o.createdAt;

    const stays = reservations.map((r) => ({
      house: houseOf.get(r.villaId)!,
      stay: { id: r.id, checkIn: r.checkIn, checkOut: r.checkOut, amount: r.totalAmount ? toMad(r.totalAmount, reservationCurrency(r)) : 0 } as StayIn,
    }));

    type Prepared = { house: string | null; date: Date; order: OrderIn; raw: (typeof orders)[number]; f: number };
    const prepared: Prepared[] = [];
    for (const o of orders) {
      const villaId = o.villaId ?? o.reservation?.villaId ?? null;
      if (villaId && !houseOf.has(villaId)) continue; // outside the countries of this user
      const currency = (villaId && villaCurrency.get(villaId)) || DEFAULT_CURRENCY;
      const f = toMad(1, currency);
      if (f == null) continue;
      const costKnown = o.items.length > 0 && o.items.every((i) => i.unitCost != null);
      prepared.push({
        house: villaId ? houseOf.get(villaId)! : null,
        date: serviceDay(o),
        order: { revenue: o.totalAmount * f, cost: providerCost(o) * f, costEstimated: !costKnown },
        raw: o,
        f,
      });
    }

    const metricsFor = (house: string, range: PeriodRange): Metrics =>
      houseMetrics(
        stays.filter((s) => s.house === house).map((s) => s.stay),
        prepared.filter((p) => p.house === house && inRange(p.date, range)).map((p) => p.order),
        range,
      );

    // Houses: the main listing of each house, with its formulas; inactive ones only if they had activity.
    const houses = villas
      .filter((v) => !v.parentVillaId)
      .map((v) => {
        const formulas = villas.filter((f) => f.parentVillaId === v.id).length;
        return { id: v.id, name: v.name, city: v.city, country: v.country, lodgify: !!v.logifyId, formulas, current: metricsFor(v.id, current), previous: metricsFor(v.id, previous), isActive: v.isActive };
      })
      .filter((h) => h.isActive || h.current.nightsSold || h.current.extrasCount || h.previous.nightsSold || h.previous.extrasCount)
      .sort((a, b) => b.current.accommodationRevenue + b.current.extrasRevenue - (a.current.accommodationRevenue + a.current.extrasRevenue));

    // Activities and providers (all houses).
    const activities = new Map<string, { key: string; name: string; category: string | null; current: Group; previous: Group }>();
    const providers = new Map<string, { id: string; name: string; current: Group; previous: Group }>();
    for (const p of prepared) {
      const which = inRange(p.date, current) ? 'current' : inRange(p.date, previous) ? 'previous' : null;
      if (!which) continue;
      for (const i of p.raw.items) {
        const key = i.serviceId ?? `label:${(i.label ?? 'Autre').toLowerCase()}`;
        const a = activities.get(key) ?? { key, name: i.service?.name ?? i.label ?? 'Prestation hors catalogue', category: i.service?.category?.name ?? null, current: emptyGroup(), previous: emptyGroup() };
        const g = a[which];
        g.revenue += i.total * p.f;
        g.count += 1;
        if (i.unitCost != null) g.cost += i.quantity * i.unitCost * p.f;
        else g.costKnown = false;
        activities.set(key, a);
      }
      if (p.raw.provider) {
        const pr = providers.get(p.raw.provider.id) ?? { id: p.raw.provider.id, name: fullName(p.raw.provider.user), current: emptyGroup(), previous: emptyGroup() };
        const g = pr[which];
        g.revenue += p.order.revenue;
        g.cost += p.order.cost;
        g.count += 1;
        if (p.order.costEstimated) g.costKnown = false;
        providers.set(p.raw.provider.id, pr);
      }
    }
    const finish = (g: Group) => ({
      count: g.count,
      revenue: Math.round(g.revenue * 100) / 100,
      cost: Math.round(g.cost * 100) / 100,
      margin: Math.round((g.revenue - g.cost) * 100) / 100,
      costKnown: g.costKnown,
    });
    const byRevenue = <T extends { current: Group; previous: Group }>(list: T[]) =>
      list
        .map((x) => ({ ...x, current: finish(x.current), previous: finish(x.previous) }))
        .filter((x) => x.current.count || x.previous.count)
        .sort((a, b) => b.current.revenue - a.current.revenue);

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return {
      kind,
      period: { start: iso(current.start), end: iso(current.end), complete },
      previousPeriod: { start: iso(previous.start), end: iso(previous.end) },
      currency: REPORT_CURRENCY,
      fx: q ? { eurToMad: this.fx.rateOf(q, 'EUR', 'MAD'), date: q.date, stale: !!q.stale } : null,
      unconverted: [...unconverted],
      totals: { current: sumMetrics(houses.map((h) => h.current)), previous: sumMetrics(houses.map((h) => h.previous)) },
      houses,
      activities: byRevenue([...activities.values()]),
      providers: byRevenue([...providers.values()]),
    };
  }
}

