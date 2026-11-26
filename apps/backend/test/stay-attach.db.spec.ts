import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachStayToLodgify } from '../src/modules/extras/stay-attach';
import { testDb, wipe } from './db';

/** The extras stay that duplicates a Lodgify booking is attached to it. */
const prisma = testDb();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
let house: string;
let formula: string;

beforeAll(async () => {
  await wipe(prisma);
  house = (await prisma.villa.create({ data: { name: 'Dar Clementine', slug: 'dar', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD' } })).id;
  formula = (await prisma.villa.create({ data: { name: 'Dar Clementine - 3 ch', slug: 'dar-3', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD', parentVillaId: house, logifyId: 'P1' } })).id;
});
afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('attaching an extras stay to its Lodgify booking', () => {
  it('moves extras and payments, keeps the file’s name, deletes the duplicate and merges the two client records', async () => {
    const fileClient = await prisma.user.create({ data: { email: 'karine@fiche.malodge.invalid', password: 'x', firstName: 'Karine', lastName: 'Renard', role: 'CLIENT', canLogin: false } });
    const lodgifyClient = await prisma.user.create({ data: { email: 'karine@guest.airbnb.com', password: 'x', firstName: 'Karine', lastName: 'Renard', role: 'CLIENT' } });
    const fromStay = await prisma.reservation.create({ data: { villaId: house, clientId: fileClient.id, label: 'Karine Renard', source: 'extras-import', status: 'CONFIRMED', totalAmount: 0, checkIn: d('2026-10-28'), checkOut: d('2026-11-01') } });
    const lodgify = await prisma.reservation.create({ data: { villaId: formula, clientId: lodgifyClient.id, logifyId: 'L9', source: 'lodgify', status: 'CONFIRMED', totalAmount: 900, checkIn: d('2026-10-28'), checkOut: d('2026-11-01') } });
    await prisma.order.create({ data: { clientId: fileClient.id, reservationId: fromStay.id, villaId: house, status: 'COMPLETED', scheduledAt: d('2026-10-29'), totalAmount: 1430, items: { create: [{ label: 'Quad', quantity: 1, unitPrice: 1430, total: 1430 }] } } });
    await prisma.settlement.create({ data: { personId: fileClient.id, reservationId: fromStay.id, kind: 'CLIENT_PAYMENT', amount: 1430, currency: 'MAD', status: 'VALIDATED', date: d('2026-10-31') } as any });

    const r = await attachStayToLodgify(prisma as any, fromStay.id, lodgify.id);
    expect(r).toMatchObject({ extras: 1, settlements: 1, mergedClient: true });
    expect(await prisma.reservation.findUnique({ where: { id: fromStay.id } })).toBeNull();
    const booking = await prisma.reservation.findUniqueOrThrow({ where: { id: lodgify.id }, include: { orders: true, settlements: true } });
    expect(booking.label).toBe('Karine Renard');
    expect(booking.orders).toHaveLength(1);
    expect(booking.orders[0].clientId).toBe(lodgifyClient.id);
    expect(booking.settlements[0].personId).toBe(lodgifyClient.id);
    expect(await prisma.user.findUnique({ where: { id: fileClient.id } })).toBeNull();
  });

  it('refuses two stays that do not overlap, or the wrong way round', async () => {
    const c = await prisma.user.create({ data: { email: 'a@fiche.malodge.invalid', password: 'x', firstName: 'Ana', lastName: 'Lima', role: 'CLIENT' } });
    const a = await prisma.reservation.create({ data: { villaId: house, clientId: c.id, label: 'Ana Lima', status: 'CONFIRMED', totalAmount: 0, checkIn: d('2026-12-01'), checkOut: d('2026-12-05') } });
    const b = await prisma.reservation.create({ data: { villaId: formula, clientId: c.id, logifyId: 'L10', status: 'CONFIRMED', totalAmount: 0, checkIn: d('2026-12-05'), checkOut: d('2026-12-08') } });
    await expect(attachStayToLodgify(prisma as any, a.id, b.id)).rejects.toThrow(/ne se chevauchent pas/);
    await expect(attachStayToLodgify(prisma as any, b.id, a.id)).rejects.toThrow(/vient de Lodgify/);
  });
});
