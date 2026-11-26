/**
 * The Finances view, as a pure computation (amounts already in one currency).
 *
 * Every figure adds up to the same total, whichever way it is cut:
 *   revenue = accommodation + extras = Σ per house = Σ per day/month of the chart.
 *
 * - Accommodation: the nights spent in the period, night by night (a stay from
 *   28 Nov to 3 Dec counts 3/5 in November). Nights still to come in the period are
 *   counted (the booking is firm) and shown apart as "à venir".
 * - Extras: realised ones (Réalisée / En cours), on the day of the service.
 * - Margin of the extras: price − cost, on the extras whose cost is known (as in the
 *   extras tracking); the others are listed apart, never given an invented cost.
 */

export type FinancePeriod = 'day' | 'week' | 'month' | 'year';

export interface Range {
  start: Date;
  /** Inclusive (23:59:59.999 of the last day). */
  end: Date;
}

const DAY = 86_400_000;
const dayNo = (d: Date) => Math.floor(d.getTime() / DAY);
const fromDayNo = (n: number) => new Date(n * DAY);
const endOf = (n: number) => new Date((n + 1) * DAY - 1);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The calendar period holding `ref` (UTC days; weeks run Monday to Sunday). */
export function financeRange(period: FinancePeriod, ref: Date): Range {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = dayNo(ref);
  switch (period) {
    case 'day':
      return { start: fromDayNo(d), end: endOf(d) };
    case 'week': {
      const monday = d - ((ref.getUTCDay() + 6) % 7);
      return { start: fromDayNo(monday), end: endOf(monday + 6) };
    }
    case 'month':
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1) - 1) };
    case 'year':
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1) - 1) };
  }
}

/** The period just before. */
export function previousRange(period: FinancePeriod, range: Range): Range {
  return financeRange(period, new Date(range.start.getTime() - 1));
}

/** The period just after. */
export function nextRange(period: FinancePeriod, range: Range): Range {
  return financeRange(period, new Date(range.end.getTime() + 1));
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** "novembre 2026", "semaine du 23 nov.", "2026", "jeu. 26 nov.". */
export function rangeLabel(period: FinancePeriod, r: Range): string {
  const s = r.start;
  switch (period) {
    case 'day':
      return `${WEEKDAYS[s.getUTCDay()]} ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
    case 'week':
      return `semaine du ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
    case 'month':
      return `${MONTHS_LONG[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
    case 'year':
      return `${s.getUTCFullYear()}`;
  }
}

export interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

/** The bars of the chart: the days of a week or a month, the months of a year (none for a day). */
export function chartBuckets(period: FinancePeriod, r: Range): Bucket[] {
  if (period === 'day') return [];
  if (period === 'year') {
    const y = r.start.getUTCFullYear();
    return MONTHS.map((label, m) => ({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label,
      start: new Date(Date.UTC(y, m, 1)),
      end: new Date(Date.UTC(y, m + 1, 1) - 1),
    }));
  }
  const out: Bucket[] = [];
  for (let d = dayNo(r.start); d <= dayNo(r.end); d++) {
    const day = fromDayNo(d);
    out.push({
      key: day.toISOString().slice(0, 10),
      label: period === 'week' ? `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()}` : String(day.getUTCDate()),
      start: day,
      end: endOf(d),
    });
  }
  return out;
}

/* ───────────────────────────── Inputs ───────────────────────────── */

export interface House {
  id: string;
  name: string;
}

export interface StayIn {
  id: string;
  house: House;
  checkIn: Date;
  checkOut: Date;
  /** Whole amount of the stay, in the report currency. */
  amount: number;
}

export interface ItemIn {
  /** Catalogue service id, else `label:<text>`. */
  key: string;
  name: string;
  category: string | null;
  quantity: number;
  /** Price billed for the line. */
  total: number;
  /** Cost of the line, null when not known. */
  cost: number | null;
}

export interface OrderIn {
  id: string;
  house: House | null;
  /** Day of the service. */
  date: Date;
  items: ItemIn[];
  /** Used when the order has no lines. */
  totalAmount: number;
}

/* ─────────────────────────── Computation ─────────────────────────── */

/** Nights of a stay in [first, last] (day numbers), and the amount of one night. */
function staySplit(s: StayIn, first: number, last: number): { amount: number; nights: number } {
  const a = dayNo(s.checkIn);
  const b = dayNo(s.checkOut);
  const total = b - a;
  // Arrival and departure the same day: the whole amount on that day.
  if (total <= 0) return a >= first && a <= last ? { amount: s.amount, nights: 0 } : { amount: 0, nights: 0 };
  const nights = Math.max(0, Math.min(b - 1, last) - Math.max(a, first) + 1);
  return { amount: (s.amount * nights) / total, nights };
}

/** The nights of a stay in [first, last], as day numbers. */
function nightsOf(s: StayIn, first: number, last: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(dayNo(s.checkIn), first); n <= Math.min(dayNo(s.checkOut) - 1, last); n++) out.push(n);
  return out;
}

const orderLines = (o: OrderIn): ItemIn[] =>
  o.items.length ? o.items : [{ key: 'label:Prestation', name: 'Prestation', category: null, quantity: 1, total: o.totalAmount, cost: null }];

export interface Totals {
  revenue: number;
  accommodation: number;
  /** Part of the accommodation for nights after today. */
  accommodationUpcoming: number;
  nights: number;
  stays: number;
  extras: number;
  extrasCount: number;
  extrasCost: number;
  /** Price − cost of the extras whose cost is known. */
  extrasMargin: number;
  /** Extras billed without a known cost (left out of the margin). */
  extrasNoCost: number;
  extrasNoCostCount: number;
}

export interface HouseRow extends House {
  accommodation: number;
  extras: number;
  revenue: number;
  nights: number;
  stays: number;
  extrasCount: number;
  extrasMargin: number;
}

export interface ActivityRow {
  key: string;
  name: string;
  category: string | null;
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  /** False when some lines have no cost (their margin is not counted). */
  costKnown: boolean;
}

export interface SeriesPoint {
  key: string;
  label: string;
  accommodation: number;
  extras: number;
  /** The bucket is after today: its nights are still to come. */
  upcoming: boolean;
}

export interface FinanceReport {
  totals: Totals;
  series: SeriesPoint[];
  byHouse: HouseRow[];
  byActivity: ActivityRow[];
}

export const NO_HOUSE: House = { id: 'none', name: 'Sans villa' };

export function financeReport(stays: StayIn[], orders: OrderIn[], range: Range, today: Date, buckets: Bucket[]): FinanceReport {
  const first = dayNo(range.start);
  const last = dayNo(range.end);
  const todayNo = dayNo(today);

  const t = { revenue: 0, accommodation: 0, accommodationUpcoming: 0, nights: 0, stays: 0, extras: 0, extrasCount: 0, extrasCost: 0, extrasMargin: 0, extrasNoCost: 0, extrasNoCostCount: 0 };
  const houses = new Map<string, HouseRow>();
  const house = (h: House) => {
    let row = houses.get(h.id);
    if (!row) houses.set(h.id, (row = { ...h, accommodation: 0, extras: 0, revenue: 0, nights: 0, stays: 0, extrasCount: 0, extrasMargin: 0 }));
    return row;
  };

  // Nights of the period with a paid stay, per house: a stay without amount on those nights
  // only is the same stay keyed twice (Lodgify + extras file), counted once.
  const paid = new Map<string, Set<number>>();
  for (const s of stays) if (s.amount > 0) for (const n of nightsOf(s, first, last)) (paid.get(s.house.id) ?? paid.set(s.house.id, new Set()).get(s.house.id)!).add(n);
  const occupied = new Map<string, Set<number>>();
  for (const s of stays) {
    const { amount, nights } = staySplit(s, first, last);
    if (!amount && !nights) continue;
    const own = nightsOf(s, first, last);
    if (!(s.amount > 0) && own.length && own.every((n) => paid.get(s.house.id)?.has(n))) continue;
    const upcoming = todayNo < last ? staySplit(s, Math.max(first, todayNo + 1), last).amount : 0;
    t.accommodation += amount;
    t.accommodationUpcoming += upcoming;
    t.stays += 1;
    const h = house(s.house);
    h.accommodation += amount;
    h.stays += 1;
    // Nights are counted once per house, even when two stays overlap.
    const set = occupied.get(s.house.id) ?? occupied.set(s.house.id, new Set()).get(s.house.id)!;
    own.forEach((n) => set.add(n));
  }
  for (const [id, set] of occupied) {
    houses.get(id)!.nights = set.size;
    t.nights += set.size;
  }

  const activities = new Map<string, ActivityRow>();
  const inRange = orders.filter((o) => dayNo(o.date) >= first && dayNo(o.date) <= last);
  for (const o of inRange) {
    const h = house(o.house ?? NO_HOUSE);
    h.extrasCount += 1;
    t.extrasCount += 1;
    for (const i of orderLines(o)) {
      t.extras += i.total;
      h.extras += i.total;
      if (i.cost != null) {
        t.extrasCost += i.cost;
        t.extrasMargin += i.total - i.cost;
        h.extrasMargin += i.total - i.cost;
      } else if (i.total) {
        t.extrasNoCost += i.total;
        t.extrasNoCostCount += 1;
      }
      const a = activities.get(i.key) ?? { key: i.key, name: i.name, category: i.category, count: 0, revenue: 0, cost: 0, margin: 0, costKnown: true };
      a.count += 1;
      a.revenue += i.total;
      if (i.cost != null) {
        a.cost += i.cost;
        a.margin += i.total - i.cost;
      } else if (i.total) a.costKnown = false;
      activities.set(i.key, a);
    }
  }
  t.revenue = t.accommodation + t.extras;

  const series: SeriesPoint[] = buckets.map((b) => {
    const bf = dayNo(b.start);
    const bl = dayNo(b.end);
    const accommodation = stays.reduce((sum, s) => sum + staySplit(s, Math.max(bf, first), Math.min(bl, last)).amount, 0);
    const extras = inRange
      .filter((o) => dayNo(o.date) >= bf && dayNo(o.date) <= bl)
      .reduce((sum, o) => sum + orderLines(o).reduce((x, i) => x + i.total, 0), 0);
    return { key: b.key, label: b.label, accommodation: round2(accommodation), extras: round2(extras), upcoming: bf > todayNo };
  });

  const totals = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k.endsWith('Count') || k === 'nights' || k === 'stays' ? v : round2(v)])) as unknown as Totals;
  const byHouse = [...houses.values()]
    .map((h) => ({ ...h, accommodation: round2(h.accommodation), extras: round2(h.extras), revenue: round2(h.accommodation + h.extras), extrasMargin: round2(h.extrasMargin) }))
    .filter((h) => h.revenue || h.nights || h.extrasCount)
    // The extras of no villa go last, whatever their amount.
    .sort((a, b) => (a.id === NO_HOUSE.id ? 1 : b.id === NO_HOUSE.id ? -1 : b.revenue - a.revenue));
  const byActivity = [...activities.values()]
    .map((a) => ({ ...a, revenue: round2(a.revenue), cost: round2(a.cost), margin: round2(a.margin) }))
    .sort((a, b) => b.revenue - a.revenue);

  return { totals, series, byHouse, byActivity };
}

/** Change in % against the previous figure (null when there is nothing to compare with). */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}
