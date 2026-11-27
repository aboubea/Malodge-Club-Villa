import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StatementsService } from '../src/modules/statements/statements.service';
import { ExtrasService } from '../src/modules/extras/extras.service';
import { FxService } from '../src/modules/fx/fx.service';
import { seed, testDb, wipe } from './db';

/**
 * November statement of an owner: a house at 25 % with a second Lodgify formula,
 * a stay in euros across two months, an extra with the owner's share, a payment.
 */
const prisma = testDb();
const fx = new FxService(prisma as any);
const mail = { sendOwnerStatement: vi.fn(async () => ({ sent: true })) } as any;
const statements = new StatementsService(prisma as any, fx, new ExtrasService(prisma as any, fx as any) as any, mail);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
let ownerId: string;
let adminId: string;

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.create({ data: { key: 'fx.latest', value: { base: 'EUR', rates: { EUR: 1, MAD: 11 }, date: '2026-12-01', source: 'test', fetchedAt: new Date().toISOString() } } });
  const owner = await prisma.user.create({ data: { email: 'proprio@malodge-test.fr', password: 'x', firstName: 'Paul', lastName: 'Proprio', role: 'OWNER', canLogin: false, commissionRate: 0.5 } });
  ownerId = owner.id;
  adminId = (await seed.user(prisma, 'Admin', 'Test', 'EMPLOYEE')).id;
  const client = await seed.user(prisma, 'Ana', 'Voyageuse');
  const house = await prisma.villa.create({ data: { name: 'Villa 58', slug: 'v58', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD', ownerId, managementFeeRate: 0.25 } });
  const formula = await prisma.villa.create({ data: { name: 'Villa 58 - 3 chambres', slug: 'v58-3', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD', ownerId, parentVillaId: house.id, managementFeeRate: 0.1 } });
  // 28 Nov → 3 Dec, 1 000 € : 3 nights of 5 in November = 600 € = 6 600 MAD (on the formula: the house's 25 % applies).
  await prisma.reservation.create({ data: { villaId: formula.id, clientId: client.id, status: 'COMPLETED', checkIn: d('2026-11-28'), checkOut: d('2026-12-03'), totalAmount: 1_000, currency: 'EUR', label: 'Ana Voyageuse' } });
  // Same stay keyed from the extras file, without amount: not counted twice.
  await prisma.reservation.create({ data: { villaId: house.id, clientId: client.id, status: 'CONFIRMED', checkIn: d('2026-11-28'), checkOut: d('2026-12-03'), totalAmount: 0, label: 'Ana (fichier)' } });
  // Extra of 2 × 500 MAD bought 300 → margin 400, owner 50 % = 200 MAD.
  await prisma.order.create({
    data: { clientId: client.id, villaId: house.id, status: 'COMPLETED', scheduledAt: d('2026-11-29'), totalAmount: 1_000, items: { create: [{ label: 'Quad', quantity: 2, unitPrice: 500, unitCost: 300, total: 1_000 }] } },
  });
  await prisma.settlement.create({ data: { kind: 'OWNER_PAYOUT', status: 'VALIDATED', personId: ownerId, date: d('2026-11-30'), amount: 1_000, currency: 'MAD', updatedAt: new Date() } });
  // A formula keyed without owner: its extras belong to the owner of the house (2 × 100, cost 50 → share 50).
  const bare = await prisma.villa.create({ data: { name: 'Villa 58 - 2 chambres', slug: 'v58-2', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD', parentVillaId: house.id } });
  await prisma.order.create({
    data: { clientId: client.id, villaId: bare.id, status: 'COMPLETED', scheduledAt: d('2026-11-20'), totalAmount: 200, items: { create: [{ label: 'Massage', quantity: 2, unitPrice: 100, unitCost: 50, total: 200 }] } },
  });
  // Never closed: listed, not counted.
  await prisma.order.create({
    data: { clientId: client.id, villaId: house.id, status: 'PENDING', scheduledAt: d('2026-11-25'), totalAmount: 300, items: { create: [{ label: 'Yoga', quantity: 1, unitPrice: 300, unitCost: 100, total: 300 }] } },
  });
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('owner statement', () => {
  it('counts the nights of the month, the house rate, the extras share and the payments', async () => {
    const s = await statements.compute(ownerId, '2026-11');
    expect(s.houses).toHaveLength(1);
    expect(s.houses[0]).toMatchObject({ name: 'Villa 58', feeRate: 0.25, nights: 3, gross: 6_600, fee: 1_650, net: 4_950 });
    expect(s.houses[0].stays).toHaveLength(1);
    expect(s.houses[0].stays[0]).toMatchObject({ guest: 'Ana Voyageuse', nightsInMonth: 3, nights: 5, amountInMonth: 600, currency: 'EUR', amountInMonthMad: 6_600 });
    expect(s.extras).toEqual([
      expect.objectContaining({ label: 'Massage', price: 200, ownerShare: 50, ownerShareMad: 50, reason: null }),
      expect.objectContaining({ label: 'Yoga', price: 300, ownerShare: null, incomplete: true, reason: 'À confirmer, pas réalisé' }),
      expect.objectContaining({ label: 'Quad', price: 1_000, ownerShare: 200, ownerShareMad: 200, reason: null }),
    ]);
    expect(s.totals).toEqual({
      nights: 3, gross: 6_600, fee: 1_650, net: 4_950,
      extras: 250, extrasCount: 2, extrasSold: 1_200, extrasNotCounted: 1,
      due: 5_200, paid: 1_000, remaining: 4_200,
    });
    expect(s.warnings).toContain('1 extra (300 MAD vendus) du mois pas encore passé en « Réalisée » : non compté.');
  });

  it('puts the rest of the stay on December', async () => {
    const s = await statements.compute(ownerId, '2026-12');
    expect(s.totals).toMatchObject({ nights: 2, gross: 4_400, fee: 1_100, extras: 0 });
  });

  it('prepares drafts, sends them with the PDF, and never recomputes a sent statement', async () => {
    await expect(statements.prepareMonth('2026-11')).resolves.toMatchObject({ prepared: 1 });
    const [draft] = await statements.list('2026-11');
    expect(draft).toMatchObject({ status: 'DRAFT', owner: { name: 'Paul Proprio', email: 'proprio@malodge-test.fr' } });

    // The house's rate changed after the draft was prepared: the draft follows (no stale 25 %).
    const house = await prisma.villa.findFirstOrThrow({ where: { slug: 'v58' } });
    await prisma.villa.update({ where: { id: house.id }, data: { managementFeeRate: 0.15 } });
    const [updated] = await statements.list('2026-11');
    expect(updated.totals.fee).toBe(Math.round(updated.totals.gross * 0.15 * 100) / 100);
    expect((await prisma.ownerStatement.findUniqueOrThrow({ where: { id: draft.id } })).data).toMatchObject({ houses: [{ feeRate: 0.15 }] });
    await prisma.villa.update({ where: { id: house.id }, data: { managementFeeRate: 0.25 } });

    const { buffer } = await statements.pdf(draft.id, { id: adminId, role: 'ADMIN' });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');

    // The owner cannot read a draft.
    await expect(statements.pdf(draft.id, { id: ownerId, role: 'OWNER' })).rejects.toThrow();

    await statements.send(draft.id, adminId);
    expect(mail.sendOwnerStatement).toHaveBeenCalledWith('proprio@malodge-test.fr', 'Paul', 'novembre 2026', expect.any(Buffer), expect.stringMatching(/^releve-2026-11-paul-proprio\.pdf$/), expect.objectContaining({ due: '5 200 MAD', houses: ['Villa 58'] }));
    await expect(statements.recompute(draft.id)).rejects.toThrow(/déjà été envoyé/);
    await expect(statements.prepareMonth('2026-11')).resolves.toMatchObject({ prepared: 0, alreadySent: 1 });

    expect(await statements.mine(ownerId)).toEqual([expect.objectContaining({ month: '2026-11', monthLabel: 'novembre 2026', totalDue: 5_200 })]);
    await expect(statements.pdf(draft.id, { id: ownerId, role: 'OWNER' })).resolves.toHaveProperty('buffer');
  });
});
