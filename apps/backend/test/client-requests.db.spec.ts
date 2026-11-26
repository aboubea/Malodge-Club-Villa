import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClientRequestsService } from '../src/modules/orders/client-requests.service';
import { FxService } from '../src/modules/fx/fx.service';
import { seed, testDb, wipe } from './db';

const prisma = testDb();
const notifications = { send: vi.fn(async () => ({})) } as any;
const requests = new ClientRequestsService(prisma as any, new FxService(prisma as any), notifications);
let clientId: string;
let otherClientId: string;
let stayId: string;
let otherStayId: string;
let massageId: string;
let transferId: string;
let hiddenId: string;

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.create({ data: { key: 'fx.latest', value: { base: 'EUR', rates: { EUR: 1, MAD: 11 }, date: '2026-11-26', source: 'test', fetchedAt: new Date().toISOString() } } });
  await prisma.user.create({ data: { email: 'gerante@malodge-test.fr', password: 'x', firstName: 'Gérante', lastName: 'Test', role: 'MANAGER' } });
  clientId = (await seed.user(prisma, 'Ana', 'Voyageuse')).id;
  otherClientId = (await seed.user(prisma, 'Bob', 'Autre')).id;
  const villa = await seed.villa(prisma, 'Villa 58', 'MAD');
  const inAWeek = new Date(Date.now() + 7 * 86_400_000);
  stayId = (await prisma.reservation.create({ data: { villaId: villa.id, clientId, status: 'CONFIRMED', totalAmount: 0, checkIn: new Date(), checkOut: inAWeek } })).id;
  otherStayId = (await prisma.reservation.create({ data: { villaId: villa.id, clientId: otherClientId, status: 'CONFIRMED', totalAmount: 0, checkIn: new Date(), checkOut: inAWeek } })).id;
  const cat = await prisma.serviceCategory.create({ data: { name: 'Bien-être', slug: 'bien-etre' } });
  // Catalogue in euros, public price 40 € (= 440 MAD), cost 25 €.
  massageId = (await prisma.service.create({ data: { name: 'Massage 1 h', slug: 'massage', categoryId: cat.id, basePrice: 35, publicPrice: 40, unitCost: 25, currency: 'EUR' } })).id;
  // Price set for this villa, in MAD.
  transferId = (await prisma.service.create({ data: { name: 'Transfert aéroport', slug: 'transfert', categoryId: cat.id, basePrice: 300, currency: 'MAD' } })).id;
  await prisma.villaService.create({ data: { villaId: villa.id, serviceId: transferId, customPrice: 350 } });
  // Not offered at this villa.
  hiddenId = (await prisma.service.create({ data: { name: 'Golf', slug: 'golf', categoryId: cat.id, basePrice: 900, currency: 'MAD' } })).id;
  await prisma.villaService.create({ data: { villaId: villa.id, serviceId: hiddenId, isActive: false } });
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

describe('client requests', () => {
  it('shows the catalogue at the villa’s prices, in its currency, without costs', async () => {
    const c = await requests.catalogue(clientId, stayId);
    expect(c.currency).toBe('MAD');
    const byName = Object.fromEntries(c.services.map((s) => [s.name, s]));
    expect(byName['Massage 1 h'].price).toBe(440);
    expect(byName['Transfert aéroport'].price).toBe(350);
    expect(byName['Golf']).toBeUndefined();
    expect(JSON.stringify(c)).not.toContain('unitCost');
  });

  it('prices the request on the server and sends it to the team, to confirm', async () => {
    const r = await requests.request(clientId, { reservationId: stayId, scheduledAt: tomorrow(), items: [{ serviceId: massageId, quantity: 2 }] });
    expect(r).toMatchObject({ status: 'PENDING', totalAmount: 880, currency: 'MAD' });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: r.id }, include: { items: true } });
    expect(order).toMatchObject({ clientId, reservationId: stayId, providerStatus: 'PENDING', commission: 330 });
    expect(order.items[0]).toMatchObject({ unitPrice: 440, unitCost: 275, quantity: 2 });
    expect(notifications.send).toHaveBeenCalledWith(expect.any(String), 'Demande d’extra : Massage 1 h × 2', expect.stringContaining('Ana Voyageuse'), 'info', 'in_app', r.id, 'order');
  });

  it('refuses another client’s stay, a service not offered there and a past date', async () => {
    await expect(requests.request(clientId, { reservationId: otherStayId, items: [{ serviceId: massageId, quantity: 1 }] })).rejects.toThrow(/pas le vôtre/);
    await expect(requests.request(clientId, { reservationId: stayId, items: [{ serviceId: hiddenId, quantity: 1 }] })).rejects.toThrow(/indisponible/);
    await expect(requests.request(clientId, { reservationId: stayId, scheduledAt: '2020-01-01T10:00:00Z', items: [{ serviceId: transferId, quantity: 1 }] })).rejects.toThrow(/passée/);
  });

  it('lists the client’s own requests only', async () => {
    const mine = await requests.mine(clientId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'PENDING', total: 880, currency: 'MAD', items: [{ name: 'Massage 1 h', quantity: 2 }] });
    expect(await requests.mine(otherClientId)).toHaveLength(0);
  });
});
