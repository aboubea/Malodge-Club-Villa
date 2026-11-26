import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommissionRulesService } from '../src/modules/extras/commission-rules.service';
import { ExtrasService } from '../src/modules/extras/extras.service';
import { StatementsService } from '../src/modules/statements/statements.service';
import { FxService } from '../src/modules/fx/fx.service';
import { seed, testDb, wipe } from './db';

/**
 * Commission rules end to end: an owner at 50 % of the margin by default, then a rule for the
 * activities of his house (20 % of the price), a fixed amount for an employee on one service,
 * and a summer period. The extras lines and the owner's statement follow.
 */
const prisma = testDb();
const fx = new FxService(prisma as any);
const extras = new ExtrasService(prisma as any, fx as any);
const rules = new CommissionRulesService(prisma as any, extras);
const statements = new StatementsService(prisma as any, fx, extras as any, { sendOwnerStatement: vi.fn() } as any);
const admin = { id: 'admin', role: 'SUPER_ADMIN' };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ids: Record<string, string> = {};

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.create({ data: { key: 'fx.latest', value: { base: 'EUR', rates: { EUR: 1, MAD: 11 }, date: '2026-11-01', source: 'test', fetchedAt: new Date().toISOString() } } });
  const owner = await prisma.user.create({ data: { email: 'paul@malodge-test.fr', password: 'x', firstName: 'Paul', lastName: 'Proprio', role: 'OWNER', canLogin: false, commissionRate: 0.5 } });
  const seller = await prisma.user.create({ data: { email: 'sara@malodge-test.fr', password: 'x', firstName: 'Sara', lastName: 'Vente', role: 'EMPLOYEE', canLogin: false, commissionRate: 0.1, commissionBase: 'MALODGE_MARGIN' } });
  const client = await seed.user(prisma, 'Ana', 'Voyageuse');
  const house = await prisma.villa.create({ data: { name: 'Villa 58', slug: 'v58', address: '-', city: '-', country: 'Maroc', currency: 'MAD', ownerId: owner.id } });
  const formula = await prisma.villa.create({ data: { name: 'Villa 58 - 3 ch', slug: 'v58-3', address: '-', city: '-', country: 'Maroc', currency: 'MAD', ownerId: owner.id, parentVillaId: house.id } });
  const activities = await prisma.serviceCategory.create({ data: { name: 'Activités', slug: 'activites' } });
  const meals = await prisma.serviceCategory.create({ data: { name: 'Repas', slug: 'repas' } });
  const svc = (name: string, categoryId: string) => prisma.service.create({ data: { name, slug: name.toLowerCase(), categoryId, basePrice: 0, currency: 'MAD' } });
  const quad = await svc('Quad', activities.id);
  const chef = await svc('Chef', meals.id);
  const stay = await prisma.reservation.create({ data: { villaId: formula.id, clientId: client.id, status: 'COMPLETED', checkIn: d('2026-08-01'), checkOut: d('2026-08-20'), totalAmount: 0 } });
  const extra = (serviceId: string, date: string, qty: number, price: number, cost: number) =>
    prisma.order.create({
      data: {
        clientId: client.id, reservationId: stay.id, villaId: formula.id, sellerId: seller.id, status: 'COMPLETED', scheduledAt: d(date), totalAmount: qty * price,
        items: { create: [{ serviceId, quantity: qty, unitPrice: price, unitCost: cost, total: qty * price }] },
      },
      include: { items: true },
    });
  ids.quadLine = (await extra(quad.id, '2026-08-05', 2, 500, 300)).items[0].id; // 1 000, cost 600, margin 400
  ids.chefLine = (await extra(chef.id, '2026-08-06', 1, 800, 500)).items[0].id; // 800, cost 500, margin 300
  Object.assign(ids, { owner: owner.id, seller: seller.id, house: house.id, activities: activities.id, chef: chef.id });
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

const line = async (id: string) => (await extras.loadLines()).find((l) => l.id === id)!;

describe('commission rules', () => {
  it('without rules, the default rates', async () => {
    expect(await line(ids.quadLine)).toMatchObject({ ownerShare: 200, sellerShare: 20, ownerRule: null });
  });

  it('a rule on the house and a category: the owner gets 20 % of the price of the activities', async () => {
    const r = await rules.create({ beneficiary: 'OWNER', villaId: ids.house, categoryId: ids.activities, base: 'PRICE', rate: 0.2 });
    const quad = await line(ids.quadLine);
    expect(quad).toMatchObject({ ownerShare: 200, malodgeShare: 200, ownerRule: { id: r.id, base: 'PRICE' } });
    // The chef is not an activity: default rate.
    expect(await line(ids.chefLine)).toMatchObject({ ownerShare: 150, ownerRule: null });
  });

  it('a fixed amount for the employee on one service, and a dated rule for the summer', async () => {
    await rules.create({ beneficiary: 'EMPLOYEE', personId: ids.seller, serviceId: ids.chef, base: 'FIXED', amount: 40 });
    await rules.create({ beneficiary: 'OWNER', personId: ids.owner, base: 'MARGIN', rate: 0.6, validFrom: '2026-08-01', validTo: '2026-08-31' });
    const chef = await line(ids.chefLine);
    expect(chef).toMatchObject({ sellerShare: 40, ownerShare: 180 }); // 60 % of 300 in August
    // The activity rule is more specific than the summer one: it still applies to the quad.
    expect(await line(ids.quadLine)).toMatchObject({ ownerShare: 200 });
  });

  it('the owner statement follows the rules', async () => {
    const s = await statements.compute(ids.owner, '2026-08');
    expect(s.totals.extras).toBe(200 + 180);
  });

  it('lists the rules with what they apply to, and refuses what makes no sense', async () => {
    const { rules: list } = await rules.list(admin);
    expect(list).toHaveLength(3);
    expect(list.find((r) => r.base === 'PRICE')).toMatchObject({ description: '20 % du prix', usage: { count: 1, share: 200 }, villa: { name: 'Villa 58' }, category: { name: 'Activités' } });
    await expect(rules.create({ beneficiary: 'OWNER', base: 'MALODGE_SHARE', rate: 0.1 })).rejects.toThrow(/part Malodge/);
    await expect(rules.create({ beneficiary: 'OWNER', base: 'FIXED' })).rejects.toThrow(/Montant/);
    await expect(rules.create({ beneficiary: 'EMPLOYEE', personId: ids.owner, base: 'MARGIN', rate: 0.1 })).rejects.toThrow(/Salarié introuvable/);
    await expect(rules.create({ beneficiary: 'OWNER', base: 'MARGIN', rate: 0.1, validFrom: '2026-09-01', validTo: '2026-08-01' })).rejects.toThrow(/période/);
  });
});
