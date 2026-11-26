/**
 * Currencies: amounts are never converted and never added across currencies.
 *
 * - An extra (order) is priced in its villa's currency (MAD in Morocco, EUR in France…).
 * - A booking is in the currency Lodgify gave for it, otherwise its villa's.
 */

export const DEFAULT_CURRENCY = 'EUR';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const BY_COUNTRY: [RegExp, string][] = [
  [/^(maroc|morocco|ma|mar)$/, 'MAD'],
  [/^(royaume[- ]uni|united kingdom|uk|gb|angleterre|england)$/, 'GBP'],
  [/^(etats[- ]unis|united states|usa|us)$/, 'USD'],
  [/^(suisse|switzerland|ch)$/, 'CHF'],
];

/** The usual currency of a country (EUR when unknown). */
export function currencyForCountry(country: string | null | undefined): string {
  const c = norm(country ?? '');
  return BY_COUNTRY.find(([re]) => re.test(c))?.[1] ?? DEFAULT_CURRENCY;
}

/** Villa id → currency, to price orders (an order points at its villa by id). */
export type VillaCurrencies = Map<string, string>;

export function orderCurrency(villas: VillaCurrencies, o: { villaId?: string | null; reservation?: { villaId?: string | null } | null }): string {
  return (o.villaId && villas.get(o.villaId)) || (o.reservation?.villaId && villas.get(o.reservation.villaId)) || DEFAULT_CURRENCY;
}

export function reservationCurrency(r: { currency?: string | null; villa?: { currency?: string | null } | null }): string {
  return r.currency || r.villa?.currency || DEFAULT_CURRENCY;
}

/** Totals per currency, largest first. */
export function totalsByCurrency<T>(items: T[], currencyOf: (x: T) => string, amountOf: (x: T) => number) {
  const map = new Map<string, number>();
  for (const x of items) map.set(currencyOf(x), (map.get(currencyOf(x)) ?? 0) + (amountOf(x) || 0));
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}

/** The currency to show by default: the one asked for if present, else the one with the most money. */
export function pickCurrency(available: { currency: string; amount: number }[], asked?: string | null): string {
  const a = asked?.toUpperCase();
  if (a && /^[A-Z]{3}$/.test(a)) return a;
  return available[0]?.currency ?? DEFAULT_CURRENCY;
}

/**
 * Revenue is counted on the day the service is done (its scheduled date),
 * not the day the order was keyed in or imported.
 */
export function serviceDate(o: { scheduledAt?: Date | null; completedAt?: Date | null; createdAt: Date }): Date {
  return o.scheduledAt ?? o.completedAt ?? o.createdAt;
}

/** Prisma filter: orders whose service date falls in [start, end]. */
export function serviceDateBetween(start: Date, end?: Date) {
  const range = end ? { gte: start, lte: end } : { gte: start };
  return {
    OR: [
      { scheduledAt: range },
      { scheduledAt: null, completedAt: range },
      { scheduledAt: null, completedAt: null, createdAt: range },
    ],
  };
}

/** What the provider is owed for an order: its cost when known, else total minus commission. */
export function providerCost(o: { totalAmount: number; commission: number; items?: { quantity: number; unitCost?: number | null }[] }): number {
  const items = o.items ?? [];
  if (items.length && items.every((i) => i.unitCost != null)) return items.reduce((s, i) => s + i.quantity * (i.unitCost as number), 0);
  return o.totalAmount - (o.commission ?? 0);
}

const DAY = 86_400_000;

/** Prisma filter: stays with nights in [start, end] (a stay without dates cannot be dated). */
export function stayNightsBetween(start: Date, end: Date) {
  return { checkIn: { lte: end }, checkOut: { gte: start } };
}

/**
 * Accommodation revenue is counted night by night, on the nights spent in [start, end]:
 * a stay from 28 Nov to 3 Dec (5 nights) counts 3/5 of its amount in November, 2/5 in December.
 * A stay without dates counts nothing; one with arrival and departure the same day counts
 * entirely on that day.
 */
export function stayRevenueBetween(s: { checkIn?: Date | null; checkOut?: Date | null; totalAmount: number }, start: Date, end: Date): number {
  if (!s.checkIn || !s.checkOut || !s.totalAmount) return 0;
  const arrival = Math.floor(s.checkIn.getTime() / DAY);
  const departure = Math.floor(s.checkOut.getTime() / DAY);
  const first = Math.ceil(start.getTime() / DAY);
  const last = Math.floor(end.getTime() / DAY); // inclusive
  const nights = departure - arrival;
  if (nights <= 0) return arrival >= first && arrival <= last ? s.totalAmount : 0;
  const inPeriod = Math.max(0, Math.min(departure, last + 1) - Math.max(arrival, first));
  return Math.round(((s.totalAmount * inPeriod) / nights) * 100) / 100;
}
