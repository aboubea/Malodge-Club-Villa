/**
 * Display currency: every amount of the interface is shown in ONE currency (MAD or €),
 * converted at today's rate. The amounts themselves are never changed (stored in their
 * own currency); only what is shown on screen is converted.
 */
export type DisplayCurrency = 'MAD' | 'EUR';

interface Quote {
  rates: Record<string, number | undefined>;
  date: string;
}

let quote: Quote | null = null;
let display: DisplayCurrency = 'MAD';

export const setDisplayQuote = (q: Quote | null) => {
  quote = q;
};
export const setDisplayCurrency = (c: DisplayCurrency) => {
  display = c;
};
export const displayCurrency = () => display;
export const displayQuote = () => quote;

/** The amount in the display currency (unchanged when the rate is unknown). */
export function toDisplay(amount: number, currency: string): { amount: number; currency: string; converted: boolean } {
  const from = (currency || 'EUR').toUpperCase();
  if (from === display || !quote) return { amount, currency: from, converted: false };
  const a = quote.rates[from];
  const b = quote.rates[display];
  if (!a || !b) return { amount, currency: from, converted: false };
  return { amount: (amount * b) / a, currency: display, converted: true };
}

/**
 * Totals kept per currency → one set in the display currency (each converted at today's
 * rate, then added; a converted total is rounded to the unit). Empty currencies are dropped.
 * When a rate is missing, the currencies stay apart rather than being added wrongly.
 */
export function mergeInDisplay<T>(rows: T[], currencyOf: (r: T) => string, fields: readonly (keyof T)[]): { currency: string; row: T; converted: string[] }[] {
  const used = rows.filter((r) => fields.some((k) => Number(r[k]) || 0));
  if (!used.length) return [];
  if (!used.every((r) => toDisplay(1, currencyOf(r)).currency === display)) return used.map((r) => ({ currency: currencyOf(r), row: r, converted: [] }));
  const converted = used.map(currencyOf).filter((c) => c.toUpperCase() !== display);
  const row = { ...used[0] } as T;
  for (const k of fields) {
    const v = used.reduce((sum, r) => sum + toDisplay(Number(r[k]) || 0, currencyOf(r)).amount, 0);
    (row as Record<keyof T, unknown>)[k] = converted.length ? Math.round(v) : v;
  }
  return [{ currency: display, row, converted }];
}
