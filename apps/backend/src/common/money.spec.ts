import { describe, expect, it } from 'vitest';
import {
  currencyForCountry,
  orderCurrency,
  pickCurrency,
  providerCost,
  reservationCurrency,
  serviceDate,
  serviceDateBetween,
  stayRevenueBetween,
  totalsByCurrency,
} from './money';
import { canonicalCountries, canonicalCountry } from './geo';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('currencies', () => {
  it('uses the dirham in Morocco, whatever the spelling, and the euro by default', () => {
    expect(currencyForCountry('Maroc')).toBe('MAD');
    expect(currencyForCountry('Morocco')).toBe('MAD');
    expect(currencyForCountry(' MA ')).toBe('MAD');
    expect(currencyForCountry('France')).toBe('EUR');
    expect(currencyForCountry(null)).toBe('EUR');
    expect(currencyForCountry('Royaume-Uni')).toBe('GBP');
  });

  it('prices an extra in its villa currency, via the stay when the order has no villa', () => {
    const villas = new Map([
      ['v-ma', 'MAD'],
      ['v-fr', 'EUR'],
    ]);
    expect(orderCurrency(villas, { villaId: 'v-ma' })).toBe('MAD');
    expect(orderCurrency(villas, { villaId: null, reservation: { villaId: 'v-fr' } })).toBe('EUR');
    expect(orderCurrency(villas, { villaId: 'unknown' })).toBe('EUR');
  });

  it('keeps the Lodgify currency of a booking before the villa one', () => {
    expect(reservationCurrency({ currency: 'EUR', villa: { currency: 'MAD' } })).toBe('EUR');
    expect(reservationCurrency({ currency: null, villa: { currency: 'MAD' } })).toBe('MAD');
    expect(reservationCurrency({})).toBe('EUR');
  });

  it('never adds amounts of different currencies', () => {
    const totals = totalsByCurrency(
      [
        { c: 'MAD', a: 18_700 },
        { c: 'EUR', a: 1_400 },
        { c: 'MAD', a: 300 },
      ],
      (x) => x.c,
      (x) => x.a,
    );
    expect(totals).toEqual([
      { currency: 'MAD', amount: 19_000 },
      { currency: 'EUR', amount: 1_400 },
    ]);
  });

  it('shows the currency asked for, else the one with the most money', () => {
    const available = [
      { currency: 'MAD', amount: 19_000 },
      { currency: 'EUR', amount: 1_400 },
    ];
    expect(pickCurrency(available)).toBe('MAD');
    expect(pickCurrency(available, 'eur')).toBe('EUR');
    expect(pickCurrency(available, 'not-a-code')).toBe('MAD');
    expect(pickCurrency([])).toBe('EUR');
  });

  it('spells each country once', () => {
    expect(canonicalCountry('Morocco')).toBe('Maroc');
    expect(canonicalCountry('Royaume du Maroc')).toBe('Maroc');
    expect(canonicalCountry('Spain')).toBe('Espagne');
    expect(canonicalCountry('  Grèce ')).toBe('Grèce');
    expect(canonicalCountries(['Maroc', 'Morocco', 'MA', 'France', ''])).toEqual(['Maroc', 'France']);
  });
});

describe('revenue is dated on the day the service is done', () => {
  it('uses the scheduled date, then the completion date, and the keying date only as a last resort', () => {
    const created = d('2026-01-05');
    expect(serviceDate({ scheduledAt: d('2026-08-10'), completedAt: d('2026-08-11'), createdAt: created })).toEqual(d('2026-08-10'));
    expect(serviceDate({ scheduledAt: null, completedAt: d('2026-08-11'), createdAt: created })).toEqual(d('2026-08-11'));
    expect(serviceDate({ scheduledAt: null, completedAt: null, createdAt: created })).toEqual(created);
  });

  it('filters orders on that same date', () => {
    const start = d('2026-08-01');
    const end = d('2026-08-31');
    expect(serviceDateBetween(start, end)).toEqual({
      OR: [
        { scheduledAt: { gte: start, lte: end } },
        { scheduledAt: null, completedAt: { gte: start, lte: end } },
        { scheduledAt: null, completedAt: null, createdAt: { gte: start, lte: end } },
      ],
    });
  });

  it('counts a stay night by night: 28 Nov → 3 Dec is 3/5 in November and 2/5 in December', () => {
    const stay = { checkIn: d('2026-11-28'), checkOut: d('2026-12-03'), totalAmount: 5_000 };
    const nov = stayRevenueBetween(stay, d('2026-11-01'), new Date('2026-11-30T23:59:59.999Z'));
    const dec = stayRevenueBetween(stay, d('2026-12-01'), new Date('2026-12-31T23:59:59.999Z'));
    expect(nov).toBe(3_000);
    expect(dec).toBe(2_000);
    expect(nov + dec).toBe(stay.totalAmount);
  });

  it('counts nothing for a stay outside the period or without dates', () => {
    const period = [d('2026-11-01'), new Date('2026-11-30T23:59:59.999Z')] as const;
    expect(stayRevenueBetween({ checkIn: d('2026-10-01'), checkOut: d('2026-10-05'), totalAmount: 800 }, ...period)).toBe(0);
    // Departure on the 1st: the last night is the one of 31 October.
    expect(stayRevenueBetween({ checkIn: d('2026-10-28'), checkOut: d('2026-11-01'), totalAmount: 800 }, ...period)).toBe(0);
    expect(stayRevenueBetween({ checkIn: null, checkOut: null, totalAmount: 800 }, ...period)).toBe(0);
  });

  it('counts a same-day stay entirely on its day', () => {
    const stay = { checkIn: d('2026-11-26'), checkOut: d('2026-11-26'), totalAmount: 450 };
    expect(stayRevenueBetween(stay, d('2026-11-26'), new Date('2026-11-26T23:59:59Z'))).toBe(450);
    expect(stayRevenueBetween(stay, d('2026-11-27'), new Date('2026-11-30T23:59:59Z'))).toBe(0);
  });

  it('stops at the end of the period (nights to come are not revenue yet)', () => {
    const stay = { checkIn: d('2026-11-24'), checkOut: d('2026-11-29'), totalAmount: 1_000 };
    // Period ending on the 26th in the evening: nights of the 24th, 25th and 26th.
    expect(stayRevenueBetween(stay, d('2026-11-01'), new Date('2026-11-26T19:00:00Z'))).toBe(600);
  });
});

describe('provider cost', () => {
  it('is the purchase cost when every line has one', () => {
    expect(providerCost({ totalAmount: 1_000, commission: 100, items: [{ quantity: 2, unitCost: 300 }] })).toBe(600);
  });
  it('is the total minus the commission otherwise', () => {
    expect(providerCost({ totalAmount: 1_000, commission: 150, items: [{ quantity: 2, unitCost: 300 }, { quantity: 1, unitCost: null }] })).toBe(850);
    expect(providerCost({ totalAmount: 1_000, commission: 150 })).toBe(850);
  });
});
