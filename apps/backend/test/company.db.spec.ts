import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/modules/settings/settings.service';
import { MailService } from '../src/modules/mail/mail.service';
import { testDb, wipe } from './db';

const prisma = testDb();
const sent: { from: string; subject: string; html: string }[] = [];
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (m: { from: string; subject: string; html: string }) => (sent.push(m), { data: { id: 'x' }, error: null }) };
  },
}));
const mail = new MailService({ get: (k: string) => ({ RESEND_API_KEY: 're_test_0123456789', MAIL_FROM: 'noreply@malodge.fr', APP_URL: 'https://app.test' } as Record<string, string>)[k] } as any);
const settings = new SettingsService(prisma as any, mail);
settings.onModuleInit();

beforeAll(async () => {
  await wipe(prisma);
  await prisma.appSetting.deleteMany({ where: { key: 'company' } });
});
afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: 'company' } });
  await prisma.$disconnect();
});

describe('company details (Paramètres › Général)', () => {
  it('keeps the built-in name until it is saved', async () => {
    expect(await settings.getCompany()).toMatchObject({ name: 'Malodge Club Villa', saved: false });
    await mail.sendTest('ana@example.com');
    expect(sent[0].from).toBe('Malodge Club <noreply@malodge.fr>');
    expect(sent[0].subject).toContain('Malodge Club');
  });

  it('saves the new name, reads it back, and signs the e-mails with it', async () => {
    const saved = await settings.setCompany({ name: 'Riad Concierge', supportEmail: 'Contact@Riad.ma', phone: '', website: 'riad.ma' });
    expect(saved).toEqual({ name: 'Riad Concierge', supportEmail: 'contact@riad.ma', phone: '', website: 'https://riad.ma', saved: true });
    // Read from the database, as after a restart.
    const fresh = new SettingsService(prisma as any, { } as any);
    expect(await fresh.getCompany()).toMatchObject({ name: 'Riad Concierge', saved: true });

    await mail.sendTest('ana@example.com');
    const last = sent[sent.length - 1];
    expect(last.from).toBe('Riad Concierge <noreply@malodge.fr>');
    expect(last.subject).toContain('Riad Concierge');
    expect(last.subject + last.html).not.toMatch(/Malodge Club(?! ?<)/);
  });

  it('refuses an empty name', async () => {
    await expect(settings.setCompany({ name: '' })).rejects.toThrow(/au moins 2/);
    expect((await settings.getCompany()).name).toBe('Riad Concierge');
  });
});
