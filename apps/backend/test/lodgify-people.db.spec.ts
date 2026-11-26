import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LodgifyService } from '../src/modules/lodgify/lodgify.service';
import { FxService } from '../src/modules/fx/fx.service';
import { mergePeople } from '../src/modules/extras/people-merge';
import { testDb, wipe } from './db';

/** Merged people stay merged: a Lodgify read never brings a duplicate back (local copy only). */
const prisma = testDb();
const lodgify = new LodgifyService(prisma as any, new FxService(prisma as any));
const copy = (bookings: any[]) => (lodgify as any).copyBookings(bookings);
const booking = (id: string, guestName: string, extra: Partial<{ guestEmail: string | null; guestPhone: string | null; day: number }> = {}) => ({
  id,
  propertyId: 'P58',
  propertyName: 'Villa 58',
  guestName,
  guestEmail: extra.guestEmail ?? null,
  guestPhone: extra.guestPhone ?? null,
  checkIn: new Date(Date.UTC(2026, 11, extra.day ?? 1)),
  checkOut: new Date(Date.UTC(2026, 11, (extra.day ?? 1) + 3)),
  guests: 2,
  totalAmount: 1000,
  currency: 'EUR',
  status: 'CONFIRMED',
  notes: null,
  enquiry: false,
});
const named = (first: string) => prisma.user.findMany({ where: { firstName: first }, select: { id: true, email: true, phone: true } });

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.deleteMany({ where: { key: 'people.emailAliases' } });
  await prisma.villa.create({ data: { name: 'Villa 58', slug: 'v58', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD', logifyId: 'P58' } });
});
afterAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.deleteMany({ where: { key: 'people.emailAliases' } });
  await prisma.$disconnect();
});

describe('Lodgify reads and merged people', () => {
  it('a merge made in the app is not undone by the next reads', async () => {
    // Two bookings of the same guest without e-mail, copied as two records before (the old behaviour).
    const x = await prisma.user.create({ data: { email: 'lodgify-guest-B1@malodge.local', password: 'x', firstName: 'Karine', lastName: 'Renard', role: 'CLIENT', canLogin: false } });
    const y = await prisma.user.create({ data: { email: 'lodgify-guest-B2@malodge.local', password: 'x', firstName: 'Karine', lastName: 'Renard', role: 'CLIENT', canLogin: false } });
    await copy([booking('B1', 'Karine Renard', { day: 1 })]);
    await prisma.reservation.update({ where: { logifyId: 'B1' }, data: { clientId: x.id } });
    await prisma.reservation.create({ data: { logifyId: 'B2', villaId: (await prisma.villa.findFirstOrThrow()).id, clientId: y.id, status: 'CONFIRMED', totalAmount: 900, checkIn: new Date(Date.UTC(2026, 11, 10)), checkOut: new Date(Date.UTC(2026, 11, 12)), source: 'lodgify' } });

    await mergePeople(prisma as any, y.id, x.id, { mergeStays: false });
    for (let i = 0; i < 3; i++) await copy([booking('B1', 'Karine Renard', { day: 1 }), booking('B2', 'Karine Renard', { day: 10 })]);

    expect(await named('Karine')).toHaveLength(1);
    const stays = await prisma.reservation.findMany({ where: { logifyId: { in: ['B1', 'B2'] } }, select: { clientId: true } });
    expect(stays.every((s) => s.clientId === x.id)).toBe(true);
  });

  it('a new booking without e-mail goes to the client of the same name (an owner’s own stays)', async () => {
    await copy([booking('O1', 'Christophe Proprio', { day: 3 }), booking('O2', 'Christophe Proprio', { day: 15 }), booking('O3', 'christophe  PROPRIO', { day: 20 })]);
    expect(await named('Christophe')).toHaveLength(1);
  });

  it('…unless their phones say they are two people', async () => {
    const [k] = await named('Karine');
    await prisma.user.update({ where: { id: k.id }, data: { phone: '+33 6 00 00 00 01' } });
    await copy([booking('B4', 'Karine Renard', { day: 20, guestPhone: '+33 6 99 99 99 99' })]);
    expect(await named('Karine')).toHaveLength(2);
    await copy([booking('B5', 'Karine Renard', { day: 25, guestPhone: '06 00 00 00 01' })]);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { logifyId: 'B5' } })).clientId).toBe(k.id);
  });

  it('a new booking with the address of a merged duplicate goes to the record kept', async () => {
    const z = await prisma.user.create({ data: { email: 'ana@example.com', password: 'x', firstName: 'Ana', lastName: 'Lima', role: 'CLIENT' } });
    const w = await prisma.user.create({ data: { email: 'ana.old@example.com', password: 'x', firstName: 'Ana', lastName: 'Lim', role: 'CLIENT' } });
    await mergePeople(prisma as any, w.id, z.id, { mergeStays: false });
    await copy([booking('A1', 'Ana Lim', { day: 5, guestEmail: 'Ana.Old@example.com' })]);
    expect(await named('Ana')).toHaveLength(1);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { logifyId: 'A1' } })).clientId).toBe(z.id);
  });

  it('a booking already copied completes its client’s e-mail and phone when Lodgify now has them', async () => {
    await copy([booking('B1', 'Karine Renard', { day: 1, guestEmail: 'karine@example.com', guestPhone: '+33 6 00 00 00 01' })]);
    const stay = await prisma.reservation.findUniqueOrThrow({ where: { logifyId: 'B1' }, include: { client: true } });
    expect(stay.client.email).toBe('karine@example.com');
  });
});
