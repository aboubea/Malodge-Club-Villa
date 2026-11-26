import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FinanceService } from '../src/modules/finance/finance.service';
import { PerformanceService } from '../src/modules/finance/performance.service';
import { StatementsService } from '../src/modules/statements/statements.service';
import { ExtrasService } from '../src/modules/extras/extras.service';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { FxService } from '../src/modules/fx/fx.service';
import { buildAccounts } from '../src/modules/extras/extras.calc';
import { seed, testDb, wipe } from './db';

/**
 * Every money figure of the app, checked against each other on one month (October 2026):
 * Finances (total, per villa, per day, per activity), Performance, the extras tracking,
 * the owner statement, the stay's account, the exports and the dashboard.
 *
 * 1 € = 11 MAD. Three houses: Villa 58 (MAD, with a Lodgify formula), Mas (EUR), Riad (MAD).
 */
const prisma = testDb();
const fx = new FxService(prisma as any);
const finance = new FinanceService(prisma as any, fx);
const performance = new PerformanceService(prisma as any, fx);
const extras = new ExtrasService(prisma as any, fx as any);
const statements = new StatementsService(prisma as any, fx, extras as any, { sendOwnerStatement: vi.fn() } as any);
const dashboard = new DashboardService(prisma as any, finance);

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const OCT = d('2026-10-15');
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const ids: Record<string, string> = {};

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.create({ data: { key: 'fx.latest', value: { base: 'EUR', rates: { EUR: 1, MAD: 11 }, date: '2026-11-01', source: 'test', fetchedAt: new Date().toISOString() } } });
  const owner = await prisma.user.create({ data: { email: 'paul@malodge-test.fr', password: 'x', firstName: 'Paul', lastName: 'Proprio', role: 'OWNER', canLogin: false, commissionRate: 0.5 } });
  ids.owner = owner.id;
  const client = await seed.user(prisma, 'Ana', 'Voyageuse');
  const villa = (name: string, currency: string, extra: object = {}) =>
    prisma.villa.create({ data: { name, slug: name.toLowerCase().replace(/\W+/g, '-'), address: '-', city: '-', country: currency === 'MAD' ? 'Maroc' : 'France', currency, ...extra } });
  const a = await villa('Villa 58', 'MAD', { ownerId: owner.id, managementFeeRate: 0.25 });
  const a2 = await villa('Villa 58 - 3 chambres', 'MAD', { ownerId: owner.id, parentVillaId: a.id });
  const b = await villa('Mas', 'EUR', { ownerId: owner.id, managementFeeRate: 0.2 });
  const c = await villa('Riad', 'MAD');
  Object.assign(ids, { a: a.id, b: b.id, c: c.id });

  const stay = (villaId: string, from: string, to: string, totalAmount: number, status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'PENDING', currency?: string) =>
    prisma.reservation.create({ data: { villaId, clientId: client.id, status, checkIn: d(from), checkOut: d(to), totalAmount, currency, label: `Séjour ${from}` } });
  // 28 Sep → 3 Oct on the formula, 5 000 MAD: 2 nights of 5 in October = 2 000.
  ids.s1 = (await stay(a2.id, '2026-09-28', '2026-10-03', 5_000, 'COMPLETED')).id;
  // The same stay keyed again from the extras file, without amount: counted once.
  await stay(a.id, '2026-09-28', '2026-10-03', 0, 'CONFIRMED');
  // 4 nights in October, 800 € = 8 800 MAD.
  await stay(b.id, '2026-10-10', '2026-10-14', 800, 'COMPLETED', 'EUR');
  // 29 Oct → 2 Nov, 4 000 MAD: 3 nights of 4 in October = 3 000.
  await stay(c.id, '2026-10-29', '2026-11-02', 4_000, 'CONFIRMED');
  // Arrival and departure the same day: all on that day.
  await stay(a.id, '2026-10-15', '2026-10-15', 300, 'COMPLETED');
  // Never counted: cancelled, or not confirmed.
  await stay(c.id, '2026-10-20', '2026-10-22', 999, 'CANCELLED');
  await stay(b.id, '2026-10-05', '2026-10-07', 100, 'PENDING', 'EUR');

  const order = (data: { villaId?: string; reservationId?: string; status: string; scheduledAt?: Date; completedAt?: Date; createdAt?: Date }, items: [string, number, number, number | null][]) =>
    prisma.order.create({
      data: {
        clientId: client.id,
        ...data,
        status: data.status as any,
        totalAmount: items.reduce((s, [, q, p]) => s + q * p, 0),
        items: { create: items.map(([label, quantity, unitPrice, unitCost]) => ({ label, quantity, unitPrice, unitCost, total: quantity * unitPrice })) },
      },
    });
  // Realised in October
  await order({ villaId: a2.id, reservationId: ids.s1, status: 'COMPLETED', scheduledAt: d('2026-10-01') }, [['Quad', 2, 500, 300], ['Chef', 1, 400, null]]);
  await order({ villaId: b.id, status: 'IN_PROGRESS', scheduledAt: d('2026-10-12') }, [['Massage', 2, 50, 30]]); // 100 € = 1 100 MAD
  await order({ status: 'COMPLETED', scheduledAt: d('2026-10-20') }, [['Transfert', 1, 300, 200]]); // no villa: euros by default
  await order({ villaId: a.id, status: 'COMPLETED', completedAt: d('2026-10-18'), createdAt: d('2026-09-01') }, [['Hammam', 1, 500, 250]]); // no planned date: done on the 18th
  await order({ villaId: c.id, status: 'COMPLETED', createdAt: d('2026-10-05') }, [['Dîner', 1, 600, null]]); // no date at all: the day it was keyed
  // Not in October's revenue
  await order({ villaId: c.id, status: 'CONFIRMED', scheduledAt: d('2026-10-25') }, [['Golf', 1, 700, 500]]); // past, never closed
  await order({ villaId: c.id, status: 'PENDING', scheduledAt: d('2026-10-26') }, [['Yoga', 1, 200, null]]); // past, never confirmed
  await order({ villaId: c.id, status: 'CANCELLED', scheduledAt: d('2026-10-10') }, [['Hélico', 1, 5_000, 4_000]]);
  await order({ villaId: a.id, status: 'COMPLETED', scheduledAt: d('2026-09-30') }, [['Quad', 1, 999, 500]]); // September
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('Finances of October 2026', () => {
  it('counts the nights of the month and the realised extras, converted to dirhams', async () => {
    const r = await finance.getDashboard('month', undefined, OCT);
    expect(r.range).toMatchObject({ start: '2026-10-01', end: '2026-10-31', label: 'octobre 2026' });
    expect(r.totals).toMatchObject({
      accommodation: 2_000 + 8_800 + 3_000 + 300,
      nights: 2 + 4 + 3,
      stays: 4,
      extras: 1_400 + 1_100 + 3_300 + 500 + 600,
      extrasCount: 5,
      extrasCost: 600 + 660 + 2_200 + 250,
      extrasNoCost: 400 + 600,
      extrasNoCostCount: 2,
      extrasMargin: 400 + 440 + 1_100 + 250,
      revenue: 14_100 + 6_900,
    });
    expect(r.totals.extras - r.totals.extrasNoCost - r.totals.extrasCost).toBe(r.totals.extrasMargin);
  });

  it('adds up to the same total per villa, per day and per activity', async () => {
    const r = await finance.getDashboard('month', undefined, OCT);
    const house = (id: string) => r.byHouse.find((h) => h.id === id)!;
    expect(house(ids.a)).toMatchObject({ accommodation: 2_300, extras: 1_900, revenue: 4_200, nights: 2 }); // the formula counts on its house
    expect(house(ids.b)).toMatchObject({ accommodation: 8_800, extras: 1_100, revenue: 9_900, nights: 4 });
    expect(house(ids.c)).toMatchObject({ accommodation: 3_000, extras: 600, revenue: 3_600, nights: 3 });
    expect(house('none')).toMatchObject({ accommodation: 0, extras: 3_300 });
    expect(sum(r.byHouse.map((h) => h.revenue))).toBe(r.totals.revenue);
    expect(sum(r.series.map((p) => p.accommodation + p.extras))).toBe(r.totals.revenue);
    expect(r.series).toHaveLength(31);
    expect(sum(r.byActivity.map((a) => a.revenue))).toBe(r.totals.extras);
    expect(r.series.find((p) => p.key === '2026-10-15')!.accommodation).toBe(300);
  });

  it('lists the extras of the month left out of the revenue', async () => {
    const r = await finance.getDashboard('month', undefined, OCT);
    expect(r.pipeline.overdue).toEqual({ count: 2, amount: 900 });
    expect(r.pipeline.confirmed.count + r.pipeline.toConfirm.count).toBe(0);
  });

  it('compares with September', async () => {
    const r = await finance.getDashboard('month', undefined, OCT);
    expect(r.previous).toMatchObject({ accommodation: 3_000, extras: 999, revenue: 3_999 });
    expect(r.changes.revenue).toBeCloseTo(((21_000 - 3_999) / 3_999) * 100, 0);
  });

  it('shows one currency alone, unconverted', async () => {
    const eur = await finance.getDashboard('month', 'EUR', OCT);
    expect(eur.totals).toMatchObject({ accommodation: 800, extras: 100 + 300, revenue: 1_200 });
    const mad = await finance.getDashboard('month', 'MAD', OCT);
    expect(mad.totals.revenue + eur.totals.revenue * 11).toBe(21_000);
  });
});

describe('the same figures elsewhere in the app', () => {
  it('Performance: the same accommodation, and the extras of the villas', async () => {
    const [p, f] = await Promise.all([performance.report('month', OCT), finance.getDashboard('month', undefined, OCT)]);
    expect(p.totals.current.accommodationRevenue).toBe(f.totals.accommodation);
    const noVilla = f.byHouse.find((h) => h.id === 'none')!.extras;
    expect(p.totals.current.extrasRevenue).toBe(f.totals.extras - noVilla);
  });

  it('Extras tracking: the realised lines of October, whatever their currency', async () => {
    const lines = await extras.loadLines();
    const oct = lines.filter((l) => l.date && l.date >= d('2026-10-01') && l.date < d('2026-11-01'));
    const done = oct.filter((l) => ['COMPLETED', 'IN_PROGRESS'].includes(l.status));
    const inMad = (ls: typeof lines) => sum(ls.map((l) => (l.total ?? 0) * (l.currency === 'EUR' ? 11 : 1)));
    const f = await finance.getDashboard('month', undefined, OCT);
    // The extra with no date at all is "Date à renseigner" in the tracking, counted on the day it was keyed here.
    const undated = lines.filter((l) => !l.date && !l.cancelled);
    expect(undated.map((l) => l.label)).toEqual(['Dîner']);
    expect(inMad(done) + inMad(undated)).toBe(f.totals.extras);
    // Not realised yet: the same as the "pas encore dans le chiffre d'affaires" figures.
    expect(inMad(oct.filter((l) => ['CONFIRMED', 'PENDING'].includes(l.status)))).toBe(f.pipeline.overdue.amount);
    // Margin: the same rule (cost known only).
    expect(sum(done.map((l) => (l.margin ?? 0) * (l.currency === 'EUR' ? 11 : 1)))).toBe(f.totals.extrasMargin);
  });

  it('Owner statement: the accommodation of his villas, the duplicate counted once', async () => {
    const [s, f] = await Promise.all([statements.compute(ids.owner, '2026-10'), finance.getDashboard('month', undefined, OCT)]);
    const acc = (id: string) => f.byHouse.find((h) => h.id === id)!.accommodation;
    expect(s.totals.gross).toBe(acc(ids.a) + acc(ids.b));
    expect(s.totals.nights).toBe(2 + 4);
  });

  it('Stay account: the extras of the stay', async () => {
    const lines = await extras.loadLines();
    const accounts = buildAccounts(lines, []);
    const account = accounts.find((x) => x.role === 'CLIENT' && x.id === ids.s1);
    expect(account).toMatchObject({ currency: 'MAD', due: 1_400 });
  });

  it('Exports: the same total in the CSV', async () => {
    let body = '';
    const res = { setHeader: () => undefined, send: (b: Buffer) => (body = b.toString('utf-8')) } as any;
    await finance.exportReport('month', 'csv', res, undefined, OCT);
    expect(body).toContain('octobre 2026');
    expect(body).toContain('"Chiffre d’affaires (hébergement + extras)";21000');
    expect(body).toContain('"Total";14100;6900;21000;9;5');
  });

  it('Dashboard: the revenue of the month is the Finances figure', async () => {
    const [{ kpis }, f] = await Promise.all([dashboard.getSummary(), finance.getDashboard('month')]);
    expect(kpis.totalRevenue).toBe(f.totals.revenue);
    expect(kpis.accommodationRevenue + kpis.extrasRevenue).toBe(f.totals.revenue);
  });
});
