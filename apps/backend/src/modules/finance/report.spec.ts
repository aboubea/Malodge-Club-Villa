import { describe, expect, it } from 'vitest';
import { change, chartBuckets, financeRange, financeReport, NO_HOUSE, OrderIn, previousRange, rangeLabel, StayIn } from './report';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const villa58 = { id: 'v58', name: 'Villa 58' };
const riad = { id: 'riad', name: 'Riad' };

const stay = (id: string, house: typeof riad, from: string, to: string, amount: number): StayIn => ({ id, house, checkIn: d(from), checkOut: d(to), amount });
const order = (id: string, house: typeof riad | null, date: string, lines: [string, number, number | null][]): OrderIn => ({
  id,
  house,
  date: d(date),
  totalAmount: lines.reduce((s, l) => s + l[1], 0),
  items: lines.map(([name, total, cost]) => ({ key: `label:${name}`, name, category: null, quantity: 1, total, cost })),
});

describe('periods', () => {
  it('takes whole calendar periods, weeks from Monday', () => {
    const ref = d('2026-11-26'); // a Thursday
    expect(financeRange('day', ref)).toEqual({ start: d('2026-11-26'), end: new Date(d('2026-11-27').getTime() - 1) });
    expect(financeRange('week', ref).start).toEqual(d('2026-11-23'));
    expect(financeRange('week', ref).end).toEqual(new Date(d('2026-11-30').getTime() - 1));
    expect(financeRange('month', ref)).toEqual({ start: d('2026-11-01'), end: new Date(d('2026-12-01').getTime() - 1) });
    expect(financeRange('year', ref).start).toEqual(d('2026-01-01'));
    expect(previousRange('month', financeRange('month', d('2026-01-15'))).start).toEqual(d('2025-12-01'));
    expect(previousRange('week', financeRange('week', ref)).start).toEqual(d('2026-11-16'));
  });

  it('names the period and cuts it into bars', () => {
    expect(rangeLabel('month', financeRange('month', d('2026-11-26')))).toBe('novembre 2026');
    expect(rangeLabel('week', financeRange('week', d('2026-11-26')))).toBe('semaine du 23 nov. 2026');
    expect(chartBuckets('month', financeRange('month', d('2026-02-10')))).toHaveLength(28);
    expect(chartBuckets('week', financeRange('week', d('2026-11-26'))).map((b) => b.label)[0]).toBe('lun. 23');
    expect(chartBuckets('year', financeRange('year', d('2026-11-26')))).toHaveLength(12);
    expect(chartBuckets('day', financeRange('day', d('2026-11-26')))).toHaveLength(0);
  });
});

describe('finance report', () => {
  const range = financeRange('month', d('2026-11-15'));
  const buckets = chartBuckets('month', range);
  const today = d('2026-11-20');
  const stays = [
    stay('a', villa58, '2026-10-29', '2026-11-03', 1_000), // 5 nights, 2 in November
    stay('b', riad, '2026-11-10', '2026-11-13', 900), // 3 nights
    stay('c', riad, '2026-11-28', '2026-12-02', 2_000), // 4 nights, 3 in November (28, 29, 30), to come
    stay('d', villa58, '2026-11-15', '2026-11-15', 300), // same day: all on that day
    stay('e', villa58, '2026-12-05', '2026-12-08', 777), // other month
    stay('b-again', riad, '2026-11-10', '2026-11-13', 0), // stay b keyed again from the extras file, no amount
  ];
  const orders = [
    order('o1', villa58, '2026-11-02', [['Quad', 1_000, 600], ['Chef', 500, null]]),
    order('o2', null, '2026-11-12', [['Transfert', 300, 200]]),
    order('o3', riad, '2026-10-31', [['Massage', 400, 250]]), // other month
  ];
  const r = financeReport(stays, orders, range, today, buckets);

  it('counts the nights of the month only, and the extras of the month', () => {
    expect(r.totals.accommodation).toBe(400 + 900 + 1_500 + 300);
    expect(r.totals.nights).toBe(2 + 3 + 3);
    expect(r.totals.stays).toBe(4); // the stay keyed twice counts once
    expect(r.totals.accommodationUpcoming).toBe(1_500);
    expect(r.totals.extras).toBe(1_800);
    expect(r.totals.extrasCount).toBe(2);
    expect(r.totals.revenue).toBe(r.totals.accommodation + r.totals.extras);
  });

  it('never invents a cost: extras without one are left out of the margin', () => {
    expect(r.totals.extrasCost).toBe(800);
    expect(r.totals.extrasMargin).toBe(500);
    expect(r.totals.extrasNoCost).toBe(500);
    expect(r.totals.extrasNoCostCount).toBe(1);
    expect(r.totals.extras - r.totals.extrasNoCost - r.totals.extrasCost).toBe(r.totals.extrasMargin);
  });

  it('adds up the same whichever way it is cut', () => {
    const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum(r.byHouse.map((h) => h.revenue))).toBe(r.totals.revenue);
    expect(sum(r.byHouse.map((h) => h.accommodation))).toBe(r.totals.accommodation);
    expect(sum(r.byHouse.map((h) => h.extras))).toBe(r.totals.extras);
    expect(sum(r.series.map((p) => p.accommodation))).toBe(r.totals.accommodation);
    expect(sum(r.series.map((p) => p.extras))).toBe(r.totals.extras);
    expect(sum(r.byActivity.map((a) => a.revenue))).toBe(r.totals.extras);
    expect(r.series).toHaveLength(30);
  });

  it('puts the extras of no villa apart, last', () => {
    expect(r.byHouse.map((h) => h.id)).toEqual(['riad', 'v58', NO_HOUSE.id]);
    expect(r.byHouse[2]).toMatchObject({ extras: 300, accommodation: 0 });
  });

  it('places a same-day stay on its day and marks the days to come', () => {
    expect(r.series.find((p) => p.key === '2026-11-15')!.accommodation).toBe(300);
    expect(r.series.find((p) => p.key === '2026-11-20')!.upcoming).toBe(false);
    expect(r.series.find((p) => p.key === '2026-11-28')).toMatchObject({ accommodation: 500, upcoming: true });
  });

  it('gives the change against the period before', () => {
    expect(change(120, 100)).toBe(20);
    expect(change(50, 200)).toBe(-75);
    expect(change(10, 0)).toBeNull();
  });
});
