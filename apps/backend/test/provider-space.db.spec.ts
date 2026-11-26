import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseProviderToken, ProviderSpaceService, providerToken } from '../src/modules/provider-space/provider-space.service';
import { ExtrasService } from '../src/modules/extras/extras.service';
import { FxService } from '../src/modules/fx/fx.service';
import { appSecret } from '../src/common/security/secrets';
import { seed, testDb, wipe } from './db';

const prisma = testDb();
const notifications = { send: vi.fn(async () => ({})) } as any;
const mail = { appUrl: 'https://app.test' } as any;
const jwt = new JwtService({});
const space = new ProviderSpaceService(prisma as any, jwt, mail, new ExtrasService(prisma as any, new FxService(prisma as any)) as any, notifications);
let providerId: string;
let providerUserId: string;
let otherProviderId: string;
let orderId: string;
let otherOrderId: string;

beforeAll(async () => {
  process.env.JWT_SECRET ||= 'test-secret-0123456789abcdef';
  await wipe(prisma);
  const driver = await prisma.user.create({ data: { email: 'driver@malodge-test.fr', password: 'x', firstName: 'Mohamed', lastName: 'Chauffeur', role: 'PROVIDER', phone: '+212 600 000 000' } });
  providerUserId = driver.id;
  providerId = (await prisma.provider.create({ data: { userId: driver.id } })).id;
  const other = await seed.user(prisma, 'Autre', 'Prestataire', 'PROVIDER');
  otherProviderId = (await prisma.provider.create({ data: { userId: other.id } })).id;
  await prisma.user.create({ data: { email: 'gerante@malodge-test.fr', password: 'x', firstName: 'Gérante', lastName: 'Test', role: 'MANAGER' } });
  const client = await seed.user(prisma, 'Ana', 'Voyageuse');
  const villa = await seed.villa(prisma, 'Villa 58', 'MAD');
  const tomorrow = new Date(Date.now() + 86_400_000);
  orderId = (
    await prisma.order.create({
      data: {
        clientId: client.id, villaId: villa.id, providerId, status: 'PENDING', scheduledAt: tomorrow, totalAmount: 500,
        items: { create: [{ label: 'Transfert aéroport', quantity: 1, unitPrice: 500, unitCost: 300, total: 500 }] },
      },
    })
  ).id;
  otherOrderId = (await prisma.order.create({ data: { clientId: client.id, villaId: villa.id, providerId: otherProviderId, status: 'PENDING', scheduledAt: tomorrow, totalAmount: 800 } })).id;
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('personal link', () => {
  it('is signed by the server and cannot be forged', () => {
    const t = providerToken(providerId, 1);
    expect(parseProviderToken(t)).toEqual({ providerId, version: 1 });
    expect(parseProviderToken(t.replace('.1.', '.2.'))).toBeNull();
    expect(parseProviderToken(`${otherProviderId}.1.${t.split('.')[2]}`)).toBeNull();
    expect(parseProviderToken('n-importe-quoi')).toBeNull();
  });

  it('gives a WhatsApp message with the link', async () => {
    const l = await space.linkFor(providerId);
    expect(l.url).toBe(`https://app.test/prestataire/${providerToken(providerId, 1)}`);
    expect(l.whatsappUrl).toMatch(/^https:\/\/wa\.me\/212600000000\?text=/);
  });
});

describe('provider space', () => {
  it('shows the provider their missions with their own price, never the client price', async () => {
    const me = await space.overview(await space.resolve(providerToken(providerId, 1), undefined));
    expect(me.provider.firstName).toBe('Mohamed');
    expect(me.missions).toHaveLength(1);
    expect(me.missions[0]).toMatchObject({ id: orderId, amount: 300, currency: 'MAD', canRespond: true, villa: { name: 'Villa 58' }, guest: 'Ana Voyageuse' });
    expect(JSON.stringify(me)).not.toContain('500');
  });

  it('works with the provider account too', async () => {
    const token = jwt.sign({ sub: providerUserId, role: 'PROVIDER' }, { secret: appSecret('access') });
    await expect(space.resolve(undefined, `Bearer ${token}`)).resolves.toMatchObject({ id: providerId });
    const staff = jwt.sign({ sub: providerUserId, role: 'CLIENT' }, { secret: appSecret('access') });
    await expect(space.resolve(undefined, `Bearer ${staff}`)).rejects.toThrow();
  });

  it('lets them accept then mark done, and only their own missions', async () => {
    const me = await space.resolve(providerToken(providerId, 1), undefined);
    await expect(space.complete(me, orderId)).rejects.toThrow(/Acceptez/);
    await expect(space.respond(me, orderId, 'accept')).resolves.toMatchObject({ providerStatus: 'ACCEPTED', status: 'CONFIRMED' });
    await expect(space.respond(me, otherOrderId, 'accept')).rejects.toThrow(/introuvable/);
    expect(notifications.send).toHaveBeenCalled();
  });

  it('stops working once the links are switched off', async () => {
    await space.revoke(providerId);
    await expect(space.resolve(providerToken(providerId, 1), undefined)).rejects.toThrow(/expiré/);
    await expect(space.resolve(providerToken(providerId, 2), undefined)).resolves.toMatchObject({ id: providerId });
  });
});
