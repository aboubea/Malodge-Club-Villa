import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import { AttemptsService, LIMITS } from '../src/modules/auth/attempts.service';
import { MonitoringService, INCIDENT } from '../src/modules/monitoring/monitoring.service';
import { testDb, wipe } from './db';

const prisma = testDb();
const mail = { sendPasswordReset: vi.fn(async () => ({ sent: true })), sendAlert: vi.fn(async () => ({ sent: true })), status: () => ({ configured: true, fromIsDefault: false }) } as any;
const attempts = new AttemptsService(prisma as any);
const auth = new AuthService(prisma as any, new JwtService({}), new ConfigService(), mail, attempts);
const client = { ip: '203.0.113.7', userAgent: 'test' };
const email = 'gerant@malodge-test.fr';

beforeAll(async () => {
  process.env.JWT_SECRET ||= 'test-secret-0123456789abcdef';
  process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-0123456789';
  await wipe(prisma);
  await prisma.user.create({ data: { email, password: await bcrypt.hash('Bon-mot-de-passe-1', 4), firstName: 'Gérant', lastName: 'Test', role: 'ADMIN' } });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  vi.clearAllMocks();
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

const login = (password: string, from = client) => auth.login({ email, password } as any, from);

describe('login attempts', () => {
  it('locks an account after 5 failures, even for the right password', async () => {
    for (let i = 0; i < LIMITS.login.perEmail; i++) await expect(login('mauvais')).rejects.toMatchObject({ status: 401 });
    await expect(login('Bon-mot-de-passe-1')).rejects.toMatchObject({ status: 429 });
    await expect(login('Bon-mot-de-passe-1')).rejects.toThrow(/Réessayez dans \d+ minute/);
  });

  it('lets the owner in after a few typos, and a success clears the count', async () => {
    for (let i = 0; i < LIMITS.login.perEmail - 1; i++) await expect(login('mauvais')).rejects.toMatchObject({ status: 401 });
    await expect(login('Bon-mot-de-passe-1')).resolves.toHaveProperty('accessToken');
    for (let i = 0; i < LIMITS.login.perEmail - 1; i++) await expect(login('mauvais')).rejects.toMatchObject({ status: 401 });
    await expect(login('Bon-mot-de-passe-1')).resolves.toHaveProperty('accessToken');
  });

  it('locks an address trying many accounts', async () => {
    for (let i = 0; i < LIMITS.login.perIp; i++) {
      await expect(auth.login({ email: `inconnu${i}@test.local`, password: 'x' } as any, client)).rejects.toMatchObject({ status: 401 });
    }
    await expect(login('Bon-mot-de-passe-1')).rejects.toMatchObject({ status: 429 });
    // Another address is not affected.
    await expect(login('Bon-mot-de-passe-1', { ip: '198.51.100.1', userAgent: 'test' })).resolves.toHaveProperty('accessToken');
  });

  it('sends at most 3 reset e-mails an hour, with the same answer every time', async () => {
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await auth.forgotPassword({ email } as any, client));
    expect(new Set(answers.map((a) => a.message)).size).toBe(1);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(LIMITS.reset.perEmail);
  });
});

describe('incident journal', () => {
  it('counts a repeated error once, and e-mails the administrators about a new one only', async () => {
    const monitoring = new MonitoringService(prisma as any, mail);
    await monitoring.report('api', 'Cannot read properties of undefined', { route: 'GET /finance/dashboard', status: 500 });
    await monitoring.report('api', 'Cannot read properties of undefined', { route: 'GET /finance/dashboard', status: 500 });
    const rows = await prisma.auditLog.findMany({ where: { action: INCIDENT } });
    expect(rows).toHaveLength(1);
    expect((rows[0].changes as any).count).toBe(2);
    expect(mail.sendAlert).toHaveBeenCalledTimes(1);
    expect(mail.sendAlert.mock.calls[0][0]).toBe(email);

    const overview = await monitoring.overview();
    expect(overview.incidents[0]).toMatchObject({ kind: 'api', count: 2, route: 'GET /finance/dashboard' });
  });

  it('records e-mails that fail without e-mailing about them', async () => {
    const monitoring = new MonitoringService(prisma as any, mail);
    mail.onFailure('Invitation', 'domaine non vérifié');
    await new Promise((r) => setTimeout(r, 200));
    const rows = await prisma.auditLog.findMany({ where: { action: INCIDENT, entity: 'mail' } });
    expect(rows).toHaveLength(1);
    expect(mail.sendAlert).not.toHaveBeenCalled();
    expect(monitoring).toBeDefined();
  });
});

describe('public passwords', () => {
  it('flags an administrator using the demo password until it is changed', async () => {
    const admin = await prisma.user.create({
      data: { email: 'demo-admin@malodge-test.fr', password: await bcrypt.hash('SuperAdmin2024!', 4), firstName: 'Demo', lastName: 'Admin', role: 'SUPER_ADMIN' },
    });
    const monitoring = new MonitoringService(prisma as any, mail);
    expect(await monitoring.adminsWithPublicPassword()).toEqual(['demo-admin@malodge-test.fr']);

    await expect(auth.changePassword(admin.id, { currentPassword: 'mauvais', newPassword: 'Un-nouveau-mot-2026' } as any, client)).rejects.toMatchObject({ status: 400 });
    await expect(auth.changePassword(admin.id, { currentPassword: 'SuperAdmin2024!', newPassword: 'SuperAdmin2024!' } as any, client)).rejects.toMatchObject({ status: 400 });
    await expect(auth.changePassword(admin.id, { currentPassword: 'SuperAdmin2024!', newPassword: 'Un-nouveau-mot-2026' } as any, client)).resolves.toMatchObject({ message: 'Mot de passe modifié.' });

    expect(await monitoring.adminsWithPublicPassword()).toEqual([]);
    await expect(auth.login({ email: 'demo-admin@malodge-test.fr', password: 'Un-nouveau-mot-2026' } as any, client)).resolves.toHaveProperty('accessToken');
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('never creates the demo super administrator in production', async () => {
    await prisma.user.updateMany({ where: { role: 'SUPER_ADMIN' }, data: { role: 'ADMIN' } });
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('SUPER_ADMIN_PASSWORD', '');
    await auth.ensureSuperAdmin();
    expect(await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })).toBe(0);

    vi.stubEnv('SUPER_ADMIN_EMAIL', 'patron@malodge-test.fr');
    vi.stubEnv('SUPER_ADMIN_PASSWORD', 'Un-mot-de-passe-solide-2026');
    await auth.ensureSuperAdmin();
    expect(await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { email: true } })).toEqual({ email: 'patron@malodge-test.fr' });
    vi.unstubAllEnvs();
  });
});
