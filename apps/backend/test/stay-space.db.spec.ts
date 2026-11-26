import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StaySpaceService } from '../src/modules/stay-space/stay-space.service';
import { ClientRequestsService } from '../src/modules/orders/client-requests.service';
import { FxService } from '../src/modules/fx/fx.service';
import { stayToken } from '../src/modules/stay-space/onboarding';
import { seed, testDb, wipe } from './db';

/**
 * A Lodgify (Airbnb) booking on a formula of "Villa 58": the guest is invited from the
 * booking, opens their stay space (the house's booklet and services), asks for an extra;
 * the morning job sends the e-mails due, once, and never to an Airbnb relay address.
 */
const prisma = testDb();
const mail = { appUrl: 'https://app.test', sendGuestMessage: vi.fn(async () => ({ sent: true })) } as any;
const lodgify = { syncReservations: vi.fn(async () => ({ synced: 0, skipped: 0, errors: [], unknownProperties: [] })) } as any;
const requests = new ClientRequestsService(prisma as any, new FxService(prisma as any), { send: vi.fn(async () => ({})) } as any);
const stays = new StaySpaceService(prisma as any, mail, requests, lodgify);
const DAY = 86_400_000;
const day = (offset: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset));
};
let stayId: string;
let relayStayId: string;
let houseId: string;
let transferId: string;

beforeAll(async () => {
  process.env.JWT_SECRET ||= 'test-secret-0123456789abcdef';
  await wipe(prisma);
  await prisma.appSetting.create({ data: { key: 'fx.latest', value: { base: 'EUR', rates: { EUR: 1, MAD: 11 }, date: '2026-11-26', source: 'test', fetchedAt: new Date().toISOString() } } });
  const house = await prisma.villa.create({
    data: {
      name: 'Villa 58 - 5 chambres', bedrooms: 5, slug: 'v58', address: 'Route de Fès', city: 'Marrakech', country: 'Maroc', currency: 'MAD',
      welcomeGuide: { checkInTime: '16:00', contactName: 'Youssef', contactPhone: '+212 600 000 000', access: 'Boîte à clés 2580', wifiName: 'Villa58', wifiPassword: 'soleil', autoMessages: true },
    },
  });
  houseId = house.id;
  const formula = await prisma.villa.create({ data: { name: 'Villa 58 - Ecolodge', bedrooms: 7, slug: 'v58-7', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD', parentVillaId: house.id } });
  const cat = await prisma.serviceCategory.create({ data: { name: 'Transferts', slug: 'transferts' } });
  transferId = (await prisma.service.create({ data: { name: 'Transfert aéroport', slug: 'transfert', categoryId: cat.id, basePrice: 300, unitCost: 200, currency: 'MAD' } })).id;
  await prisma.service.create({ data: { name: 'Golf', slug: 'golf', categoryId: cat.id, basePrice: 900, currency: 'MAD' } });
  // Offered by the house (so by its formulas), at the villa's price.
  await prisma.villaService.create({ data: { villaId: house.id, serviceId: transferId, customPrice: 350 } });

  const ana = await prisma.user.create({ data: { email: 'lodgify-guest-1@malodge.local', password: 'x', firstName: 'Ana', lastName: 'Voyageuse', role: 'CLIENT', canLogin: false } });
  stayId = (await prisma.reservation.create({ data: { villaId: formula.id, clientId: ana.id, status: 'CONFIRMED', totalAmount: 900, currency: 'EUR', checkIn: day(20), checkOut: day(25), logifyId: 'L1', source: 'lodgify', guests: 4 } })).id;
  const bob = await prisma.user.create({ data: { email: 'bob-123@guest.airbnb.com', password: 'x', firstName: 'Bob', lastName: 'Relais', role: 'CLIENT', canLogin: false, phone: '+33 6 00 00 00 00' } });
  relayStayId = (await prisma.reservation.create({ data: { villaId: house.id, clientId: bob.id, status: 'CONFIRMED', totalAmount: 500, checkIn: day(1), checkOut: day(4), logifyId: 'L2', source: 'lodgify' } })).id;
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('invitation from the booking', () => {
  it('shows the link, the contact situation and the house’s services', async () => {
    const a = await stays.access(stayId);
    expect(a.url).toMatch(/^https:\/\/app\.test\/sejour\//);
    expect(a.contact).toMatchObject({ emailKind: 'none', email: null });
    // Booked on the 7-room formula: never the house's 5 rooms; the booklet stays the house's.
    expect(a).toMatchObject({ villa: { id: houseId, name: 'Villa 58 - Ecolodge - 7 chambres' }, guideReady: true, autoMessages: true, servicesCount: 1, nextStep: 'welcome' });
    expect((await stays.access(relayStayId)).villa.name).toBe('Villa 58 - 5 chambres');
  });

  it('records the e-mail typed by the team and sends the welcome', async () => {
    const r = await stays.invite(stayId, { email: 'Ana@Example.com', sendEmail: true });
    expect(r.email).toEqual({ sent: true });
    expect(mail.sendGuestMessage).toHaveBeenCalledWith('ana@example.com', 'Bienvenue à Villa 58 - Ecolodge - 7 chambres', expect.any(String), expect.any(Array), expect.objectContaining({ url: r.url }));
    expect(r.journey.welcome).toMatchObject({ channel: 'email' });
    expect(r.invitedAt).toBeTruthy();
  });
});

describe('guest stay space', () => {
  it('opens with the link: the house’s booklet (codes hidden until 2 days before) and services', async () => {
    const s = await prisma.reservation.findUniqueOrThrow({ where: { id: stayId } });
    const v = await stays.guestView(stayToken(stayId, s.accessVersion));
    expect(v.villa.name).toBe('Villa 58 - Ecolodge - 7 chambres');
    expect(v.booklet.guide).toMatchObject({ checkInTime: '16:00', wifiName: 'Villa58', contactPhone: '+212 600 000 000' });
    expect(v.booklet.guide).not.toHaveProperty('access');
    expect(v.booklet.hidden).toEqual(['access', 'wifiPassword']);
    expect(v.catalogue.services.map((x) => [x.name, x.price])).toEqual([['Transfert aéroport', 350]]);
  });

  it('lets the guest ask for one of the villa’s services, priced by the server', async () => {
    const s = await prisma.reservation.findUniqueOrThrow({ where: { id: stayId } });
    const key = stayToken(stayId, s.accessVersion);
    const r = await stays.guestRequest(key, { scheduledAt: day(20).toISOString(), items: [{ serviceId: transferId, quantity: 1 }] });
    expect(r).toMatchObject({ status: 'PENDING', totalAmount: 350 });
    expect((await stays.guestView(key)).requests).toHaveLength(1);
  });

  it('closes the space once the links are switched off', async () => {
    await stays.revoke(stayId);
    await expect(stays.guestView(stayToken(stayId, 1))).rejects.toThrow(/expiré/);
  });
});

describe('morning job', () => {
  it('reads Lodgify, sends the e-mails due once, and never to a relay address', async () => {
    mail.sendGuestMessage.mockClear();
    // Welcome went out 10 days ago: on day 20 before arrival nothing is due yet.
    await prisma.reservation.update({ where: { id: stayId }, data: { checkIn: day(5), checkOut: day(9), journey: { welcome: { at: new Date(Date.now() - 10 * DAY).toISOString(), channel: 'email' } } } });
    const first = await stays.daily();
    expect(lodgify.syncReservations).toHaveBeenCalled();
    expect(first.sent).toBe(1);
    expect(mail.sendGuestMessage).toHaveBeenCalledTimes(1);
    expect(mail.sendGuestMessage.mock.calls[0][1]).toBe('Villa 58 - Ecolodge - 7 chambres : plus qu’une semaine');
    // Bob's address is an Airbnb relay: nothing sent to him.
    expect(mail.sendGuestMessage.mock.calls.some((c: any[]) => String(c[0]).includes('airbnb'))).toBe(false);
    const again = await stays.daily();
    expect(again.sent).toBe(0);
  });

  it('lists the arrivals with the WhatsApp message to send by hand', async () => {
    const list = await stays.onboarding(30);
    const bob = list.find((x) => x.id === relayStayId)!;
    expect(bob).toMatchObject({ nextStep: 'j1', automatic: false, contact: { emailKind: 'relay' } });
    expect(bob.whatsappUrl).toMatch(/^https:\/\/wa\.me\/33600000000\?text=/);
    expect(bob.messageText).toContain('à partir de 16:00');
    await stays.markSent(relayStayId, 'j1', 'whatsapp');
    expect((await stays.onboarding(30)).find((x) => x.id === relayStayId)!.nextStep).toBeNull();
  });

  it('keeps the booklet on the house, not on a formula', async () => {
    await expect(stays.saveGuide(houseId, { checkInTime: '15:00', autoMessages: true, contactPhone: '+212 6' })).resolves.toMatchObject({ guide: { checkInTime: '15:00' }, ready: true });
    const formula = await prisma.villa.findFirstOrThrow({ where: { parentVillaId: houseId } });
    await expect(stays.saveGuide(formula.id, { checkInTime: '14:00' })).rejects.toThrow(/formule/);
  });
});
