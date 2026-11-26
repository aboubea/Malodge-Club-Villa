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
