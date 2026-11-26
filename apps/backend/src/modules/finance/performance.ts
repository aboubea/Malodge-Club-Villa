/**
 * Performance of a house over a period (pure computation, amounts already converted).
 *
 * - Nights are calendar days (stays are stored at 00:00 UTC): the night of day d is
 *   counted when arrival ≤ d < departure and d is in the period.
 * - Occupancy: nights occupied (union over the house and its formulas, so a stay keyed
 *   twice is counted once) / nights in the period.
 * - Average price per night: accommodation revenue / nights of the stays that have an
 *   amount (stays from the extras file have none and would lower it).
 * - RevPAR: accommodation revenue / nights in the period.
 * - Extras: realised extras dated on the day of the service; margin = price − provider cost.
 */

const DAY = 86_400_000;
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface StayIn {
  id: string;
  checkIn: Date | null;
  checkOut: Date | null;
  /** In the reporting currency (null when it could not be converted). */
  amount: number | null;
}

export interface OrderIn {
  /** In the reporting currency. */
  revenue: number;
  cost: number;
  /** True when part of the cost is not known (estimated as price − commission). */
  costEstimated: boolean;
}

export interface Metrics {
  nightsAvailable: number;
  nightsSold: number;
  occupancy: number | null;
  accommodationRevenue: number;
  paidNights: number;
  adr: number | null;
  revpar: number | null;
  stays: number;
  extrasRevenue: number;
  extrasCost: number;
  extrasMargin: number;
  extrasCount: number;
  extrasPerStay: number | null;
  costEstimated: boolean;
}

/** Days of the period, as day numbers [first, last]. */
export function periodDays({ start, end }: PeriodRange) {
  const first = Math.ceil(start.getTime() / DAY);
  const last = Math.floor(end.getTime() / DAY);
  return { first, last, count: Math.max(0, last - first + 1) };
}

/** Nights of a stay inside the period, as day numbers. */
export function stayNights(s: { checkIn: Date | null; checkOut: Date | null }, range: PeriodRange): number[] {
  if (!s.checkIn || !s.checkOut) return [];
  const { first, last } = periodDays(range);
  const from = Math.max(dayOf(s.checkIn), first);
  const to = Math.min(dayOf(s.checkOut) - 1, last);
  const out: number[] = [];
  for (let d = from; d <= to; d++) out.push(d);
  return out;
}

/** Share of a stay's amount for its nights in the period. */
export function stayShare(s: StayIn, range: PeriodRange): number {
  if (!s.amount || !s.checkIn || !s.checkOut) return 0;
  const total = dayOf(s.checkOut) - dayOf(s.checkIn);
  if (total <= 0) {
    const { first, last } = periodDays(range);
    const d = dayOf(s.checkIn);
    return d >= first && d <= last ? s.amount : 0;
  }
  return (s.amount * stayNights(s, range).length) / total;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function houseMetrics(stays: StayIn[], orders: OrderIn[], range: PeriodRange): Metrics {
  const nightsAvailable = periodDays(range).count;
  const occupied = new Set<number>();
  const paidOccupied = new Set<number>();
  let accommodationRevenue = 0;
  let paidNights = 0;

  const withNights = stays.map((s) => ({ s, nights: stayNights(s, range) })).filter((x) => x.nights.length);
  for (const { s, nights } of withNights) {
    nights.forEach((d) => occupied.add(d));
    if (s.amount && s.amount > 0) {
      accommodationRevenue += stayShare(s, range);
      paidNights += nights.length;
      nights.forEach((d) => paidOccupied.add(d));
    }
  }
  // Arrival and departure the same day (day use): its amount counts on that day, without a night.
  const dayUse = stays.filter((s) => s.checkIn && s.checkOut && dayOf(s.checkOut) <= dayOf(s.checkIn) && (s.amount ?? 0) > 0 && stayShare(s, range) > 0);
  for (const s of dayUse) accommodationRevenue += stayShare(s, range);
  // A stay without amount on nights already covered by a paid stay is the same stay keyed twice.
  const staysCount = withNights.filter(({ s, nights }) => (s.amount ?? 0) > 0 || nights.some((d) => !paidOccupied.has(d))).length + dayUse.length;

  const extrasRevenue = orders.reduce((t, o) => t + o.revenue, 0);
  const extrasCost = orders.reduce((t, o) => t + o.cost, 0);
  return {
    nightsAvailable,
    nightsSold: occupied.size,
    occupancy: nightsAvailable ? occupied.size / nightsAvailable : null,
    accommodationRevenue: round(accommodationRevenue),
    paidNights,
    adr: paidNights ? round(accommodationRevenue / paidNights) : null,
    revpar: nightsAvailable ? round(accommodationRevenue / nightsAvailable) : null,
    stays: staysCount,
    extrasRevenue: round(extrasRevenue),
    extrasCost: round(extrasCost),
    extrasMargin: round(extrasRevenue - extrasCost),
    extrasCount: orders.length,
    extrasPerStay: staysCount ? round(extrasRevenue / staysCount) : null,
    costEstimated: orders.some((o) => o.costEstimated),
  };
}

/** Totals of several houses (occupancy over all their nights). */
export function sumMetrics(list: Metrics[]): Metrics {
  const t = list.reduce(
    (a, m) => ({
      nightsAvailable: a.nightsAvailable + m.nightsAvailable,
      nightsSold: a.nightsSold + m.nightsSold,
      accommodationRevenue: a.accommodationRevenue + m.accommodationRevenue,
      paidNights: a.paidNights + m.paidNights,
      stays: a.stays + m.stays,
      extrasRevenue: a.extrasRevenue + m.extrasRevenue,
      extrasCost: a.extrasCost + m.extrasCost,
      extrasCount: a.extrasCount + m.extrasCount,
      costEstimated: a.costEstimated || m.costEstimated,
    }),
    { nightsAvailable: 0, nightsSold: 0, accommodationRevenue: 0, paidNights: 0, stays: 0, extrasRevenue: 0, extrasCost: 0, extrasCount: 0, costEstimated: false },
  );
  return {
    ...t,
    accommodationRevenue: round(t.accommodationRevenue),
    extrasRevenue: round(t.extrasRevenue),
    extrasCost: round(t.extrasCost),
    extrasMargin: round(t.extrasRevenue - t.extrasCost),
    occupancy: t.nightsAvailable ? t.nightsSold / t.nightsAvailable : null,
    adr: t.paidNights ? round(t.accommodationRevenue / t.paidNights) : null,
    revpar: t.nightsAvailable ? round(t.accommodationRevenue / t.nightsAvailable) : null,
    extrasPerStay: t.stays ? round(t.extrasRevenue / t.stays) : null,
  };
}

/**
 * The period containing `date` (month, quarter or year), stopped at `today` when it is
 * under way, and the same span one year earlier (to compare like with like).
 */
export function periodsFor(kind: 'month' | 'quarter' | 'year', date: Date, today = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const [fromMonth, months] = kind === 'year' ? [0, 12] : kind === 'quarter' ? [m - (m % 3), 3] : [m, 1];
  const start = new Date(Date.UTC(y, fromMonth, 1));
  const fullEnd = new Date(Date.UTC(y, fromMonth + months, 0, 23, 59, 59, 999));
  const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
  const end = fullEnd > todayEnd && start <= todayEnd ? todayEnd : fullEnd;
  const back = (d: Date) => {
    const x = new Date(d);
    x.setUTCFullYear(x.getUTCFullYear() - 1);
    // 29 Feb → 28 Feb
    if (x.getUTCMonth() !== d.getUTCMonth()) x.setUTCDate(0);
    return x;
  };
  return { current: { start, end }, previous: { start: back(start), end: back(end) }, complete: end.getTime() === fullEnd.getTime() };
}
