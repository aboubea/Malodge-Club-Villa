import { describe, expect, it } from 'vitest';
import { convert, fxRate, type FxQuote } from './fx';
import { formatCurrency, formatDay, formatMoney } from './utils';

const plain = (s: string) => s.replace(/\s/g, ' ');
const q: FxQuote = { base: 'EUR', rates: { EUR: 1, MAD: 10.96 }, date: '2026-11-26', source: 'test', stale: false };

describe('money shown in the interface', () => {
  it('keeps the cents and the currency of each amount', () => {
    expect(plain(formatCurrency(312.5, 'MAD'))).toBe('312,5 MAD');
    expect(plain(formatCurrency(18_700, 'MAD'))).toBe('18 700 MAD');
    expect(plain(formatCurrency(1_400, 'EUR'))).toBe('1 400 €');
    expect(formatMoney(null, 'MAD')).toBe('—');
  });

  it('converts euros to dirhams at the rate of the day, and never guesses a missing rate', () => {
    expect(fxRate(q, 'EUR', 'MAD')).toBeCloseTo(10.96);
    expect(convert(q, 1_000, 'EUR', 'MAD')).toBeCloseTo(10_960);
    expect(convert(q, 10_960, 'MAD', 'EUR')).toBeCloseTo(1_000);
    expect(convert(q, 100, 'EUR', 'USD')).toBeNull();
    expect(convert(null, 100, 'MAD', 'MAD')).toBe(100);
  });

  it('shows a stay date as the calendar day stored, whatever the time zone', () => {
    expect(formatDay('2026-08-08T00:00:00.000Z')).toBe('08/08/2026');
    expect(formatDay(null)).toBe('—');
  });
});
