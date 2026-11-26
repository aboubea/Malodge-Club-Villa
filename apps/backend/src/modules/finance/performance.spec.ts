import { describe, expect, it } from 'vitest';
import { houseMetrics, periodsFor, stayNights, sumMetrics } from './performance';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const november = { start: d('2026-11-01'), end: new Date('2026-11-30T23:59:59.999Z') };

describe('house performance', () => {
  it('counts the nights of the period only (arrival night in, departure night out)', () => {
    expect(stayNights({ checkIn: d('2026-10-30'), checkOut: d('2026-11-03') }, november)).toHaveLength(2); // 1 and 2 Nov
    expect(stayNights({ checkIn: d('2026-11-28'), checkOut: d('2026-12-02') }, november)).toHaveLength(3); // 28, 29, 30 Nov
    expect(stayNights({ checkIn: null, checkOut: null }, november)).toHaveLength(0);
  });

  it('gives occupancy, price per night and RevPAR', () => {
    const m = houseMetrics(
      [
        { id: 'a', checkIn: d('2026-11-01'), checkOut: d('2026-11-08'), amount: 7_000 }, // 7 nights
        { id: 'b', checkIn: d('2026-11-20'), checkOut: d('2026-11-23'), amount: 4_500 }, // 3 nights
      ],
      [],
      november,
    );
    expect(m).toMatchObject({ nightsAvailable: 30, nightsSold: 10, accommodationRevenue: 11_500, adr: 1_150, stays: 2 });
    expect(m.occupancy).toBeCloseTo(1 / 3);
    expect(m.revpar).toBeCloseTo(383.33, 2);
  });

  it('counts a stay keyed twice (file + Lodgify) once, and its missing amount does not lower the price per night', () => {
    const m = houseMetrics(
      [
        { id: 'lodgify', checkIn: d('2026-11-10'), checkOut: d('2026-11-15'), amount: 5_000 },
        { id: 'excel', checkIn: d('2026-11-10'), checkOut: d('2026-11-15'), amount: 0 },
      ],
      [],
      november,
    );
    expect(m).toMatchObject({ nightsSold: 5, stays: 1, adr: 1_000 });
  });

  it('counts a stay without amount when its nights are not otherwise booked', () => {
    const m = houseMetrics([{ id: 'excel', checkIn: d('2026-11-10'), checkOut: d('2026-11-12'), amount: 0 }], [], november);
    expect(m).toMatchObject({ nightsSold: 2, stays: 1, adr: null, accommodationRevenue: 0 });
  });

  it('gives extras revenue, margin and extras per stay', () => {
    const m = houseMetrics(
      [{ id: 'a', checkIn: d('2026-11-01'), checkOut: d('2026-11-05'), amount: 4_000 }],
      [
        { revenue: 1_000, cost: 600, costEstimated: false },
        { revenue: 500, cost: 425, costEstimated: true },
      ],
      november,
    );
    expect(m).toMatchObject({ extrasRevenue: 1_500, extrasCost: 1_025, extrasMargin: 475, extrasPerStay: 1_500, costEstimated: true });
  });

  it('adds houses up over all their nights', () => {
    const a = houseMetrics([{ id: 'a', checkIn: d('2026-11-01'), checkOut: d('2026-11-16'), amount: 15_000 }], [], november);
    const b = houseMetrics([], [], november);
    const t = sumMetrics([a, b]);
    expect(t).toMatchObject({ nightsAvailable: 60, nightsSold: 15, adr: 1_000, revpar: 250 });
    expect(t.occupancy).toBeCloseTo(0.25);
  });
});

describe('periods', () => {
  it('stops a period under way at today, and compares with the same days a year earlier', () => {
    const p = periodsFor('month', d('2026-11-26'), new Date('2026-11-26T15:00:00Z'));
    expect([p.current.start.toISOString().slice(0, 10), p.current.end.toISOString().slice(0, 10)]).toEqual(['2026-11-01', '2026-11-26']);
    expect([p.previous.start.toISOString().slice(0, 10), p.previous.end.toISOString().slice(0, 10)]).toEqual(['2025-11-01', '2025-11-26']);
    expect(p.complete).toBe(false);
  });

  it('takes whole quarters and years when they are over', () => {
    const q = periodsFor('quarter', d('2026-08-15'), d('2026-11-26'));
    expect([q.current.start.toISOString().slice(0, 10), q.current.end.toISOString().slice(0, 10), q.complete]).toEqual(['2026-07-01', '2026-09-30', true]);
    const y = periodsFor('year', d('2025-03-01'), d('2026-11-26'));
    expect([y.previous.start.toISOString().slice(0, 10), y.previous.end.toISOString().slice(0, 10)]).toEqual(['2024-01-01', '2024-12-31']);
  });
});
