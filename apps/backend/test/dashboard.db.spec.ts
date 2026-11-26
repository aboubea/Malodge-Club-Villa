import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { FxService } from '../src/modules/fx/fx.service';
import { seed, testDb, wipe } from './db';

const prisma = testDb();
const dashboard = new DashboardService(prisma as any, new FxService(prisma as any));
const day = (offset: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset));
};

beforeAll(async () => {
  await wipe(prisma);
  const client = await seed.user(prisma, 'Ana', 'Voyageuse');
  const a = await seed.villa(prisma, 'Villa 58', 'MAD');
  const formula = await prisma.villa.create({ data: { name: 'Villa 58 - 3 ch', slug: 'v58-3', address: '-', city: '-', parentVillaId: a.id, currency: 'MAD' } });
  const b = await seed.villa(prisma, 'Riad', 'MAD');
  const stay = (villaId: string, from: number, to: number, status: 'CONFIRMED' | 'COMPLETED' = 'CONFIRMED') =>
    prisma.reservation.create({ data: { villaId, clientId: client.id, status, totalAmount: 0, checkIn: day(from), checkOut: day(to) } });
  await stay(formula.id, -2, 3); // tonight, on a formula of Villa 58
  await stay(b.id, -4, 0); // leaves today: under way, but the house is free tonight
  await stay(b.id, 10, 15); // to come
  await stay(a.id, -60, -55); // old booking never marked as done
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('dashboard', () => {
  it('counts the stays under way today and the houses occupied tonight, never above 100 %', async () => {
    const { kpis } = await dashboard.getSummary();
    expect(kpis.activeReservations).toBe(2);
    expect(kpis.occupancyRate).toBe(50);
  });
});
