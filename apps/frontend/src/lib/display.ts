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
