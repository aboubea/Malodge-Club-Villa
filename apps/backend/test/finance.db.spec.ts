import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FinanceService } from '../src/modules/finance/finance.service';
import { FxService } from '../src/modules/fx/fx.service';
import { stayRevenueBetween } from '../src/common/money';
import { seed, testDb, wipe } from './db';

/**
 * Revenue of the year (dashboard): extras dated by the day of the service, stays by
 * their nights, amounts in euros converted to dirhams at the day's rate (1 € = 11 MAD here).
 */
const prisma = testDb();
const finance = new FinanceService(prisma as any, new FxService(prisma as any));

const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 1);
/** A moment of this year, already past. */
const thisYear = new Date(Math.max(startOfYear.getTime() + 60_000, now.getTime() - 2 * 3600_000));
const lastYear = new Date(Date.UTC(now.getFullYear() - 1, 5, 15));
const day = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));

let stayInYear: { checkIn: Date; checkOut: Date; totalAmount: number };

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.create({
    data: { key: 'fx.latest', value: { base: 'EUR', rates: { EUR: 1, MAD: 11 }, date: '2026-11-26', source: 'test', fetchedAt: new Date().toISOString() } },
  });
  const client = await seed.user(prisma, 'Client', 'Test');
  const ma = await seed.villa(prisma, 'Villa Maroc', 'MAD');
  const fr = await seed.villa(prisma, 'Mas France', 'EUR');
  const order = (villaId: string, totalAmount: number, status: 'COMPLETED' | 'CANCELLED', scheduledAt: Date, createdAt: Date) =>
    prisma.order.create({ data: { clientId: client.id, villaId, totalAmount, status, scheduledAt, createdAt, items: { create: [{ total: totalAmount, label: 'Extra' }] } } });

  await order(ma.id, 1_000, 'COMPLETED', thisYear, thisYear); // counted
  await order(fr.id, 100, 'COMPLETED', thisYear, lastYear); // keyed last year, done this year: counted
  await order(ma.id, 5_000, 'COMPLETED', lastYear, thisYear); // keyed this year, done last year: not counted
  await order(ma.id, 7_000, 'CANCELLED', thisYear, thisYear); // cancelled: not counted

  // Booked this year for a stay of last year: not this year's revenue.
  await prisma.reservation.create({
    data: { villaId: ma.id, clientId: client.id, status: 'COMPLETED', totalAmount: 9_999, checkIn: new Date(lastYear.getTime() - 5 * 86_400_000), checkOut: lastYear, createdAt: thisYear },
  });
  // Booked last year, nights spent this year (up to today).
  stayInYear = { checkIn: day(-6), checkOut: day(-1), totalAmount: 500 };
  await prisma.reservation.create({ data: { villaId: fr.id, clientId: client.id, status: 'COMPLETED', createdAt: lastYear, ...stayInYear } });
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('revenue of the year', () => {
  it('counts extras on the day they are done, converted to dirhams', async () => {
    const r = await finance.getDashboard('year');
    expect(r.converted).toBe(true);
    expect(r.currency).toBe('MAD');
    expect(r.totalRevenue).toBeCloseTo(1_000 + 100 * 11);
  });

  it('counts stays on their nights, not on the day they were booked', async () => {
    const r = await finance.getDashboard('year');
    const expected = stayRevenueBetween(stayInYear, startOfYear, now) * 11;
    expect(r.accommodationRevenue).toBeCloseTo(expected);
    expect(r.accommodationRevenue).toBeLessThan(9_999);
  });

  it('shows one currency alone, without conversion, when asked', async () => {
    const r = await finance.getDashboard('year', 'EUR');
    expect(r.converted).toBe(false);
    expect(r.currency).toBe('EUR');
    expect(r.totalRevenue).toBe(100);
  });
});
