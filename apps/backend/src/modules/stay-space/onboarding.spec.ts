import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanGuide, dueStep, emailKind, guideForGuest, guideReady, message, parseStayToken, sensitiveVisible, stayLinkOpen, stayToken, whatsappText } from './onboarding';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const at = (s: string) => new Date(`${s}T09:00:00.000Z`);
afterEach(() => vi.unstubAllEnvs());

describe('welcome booklet', () => {
  it('keeps the known fields only, trimmed', () => {
    expect(cleanGuide({ checkInTime: ' 16:00 ', wifiName: '', hack: 'x', autoMessages: 'yes' })).toEqual({ checkInTime: '16:00' });
    expect(cleanGuide({ autoMessages: true })).toEqual({ autoMessages: true });
  });

  it('is ready with an arrival time or address, and a contact', () => {
    expect(guideReady({ checkInTime: '16:00' })).toBe(false);
    expect(guideReady({ checkInTime: '16:00', contactPhone: '+212 6' })).toBe(true);
  });

  it('shows the access codes and the Wi-Fi password from 2 days before arrival until departure', () => {
    const g = { access: 'Code 1234', wifiName: 'Villa58', wifiPassword: 'soleil', address: 'Route de Fès' };
    const early = guideForGuest(g, d('2026-12-10'), d('2026-12-15'), at('2026-12-01'));
    expect(early.guide).toEqual({ wifiName: 'Villa58', address: 'Route de Fès' });
    expect(early.hidden).toEqual(['access', 'wifiPassword']);
    expect(early.sensitiveFrom).toBe('2026-12-08');
    expect(guideForGuest(g, d('2026-12-10'), d('2026-12-15'), at('2026-12-08')).guide).toMatchObject({ access: 'Code 1234', wifiPassword: 'soleil' });
    expect(sensitiveVisible(d('2026-12-10'), d('2026-12-15'), at('2026-12-16'))).toBe(false);
  });
});

describe('personal stay link', () => {
  it('is signed by the server, tied to the booking and its version', () => {
    vi.stubEnv('JWT_SECRET', 'a-long-random-value-0123456789');
    const t = stayToken('resa123', 1);
    expect(parseStayToken(t)).toEqual({ reservationId: 'resa123', version: 1 });
    expect(parseStayToken(t.replace('resa123', 'resa124'))).toBeNull();
    expect(parseStayToken(t.replace('.1.', '.2.'))).toBeNull();
  });

  it('works until 14 days after departure', () => {
    expect(stayLinkOpen(d('2026-12-15'), at('2026-12-29'))).toBe(true);
    expect(stayLinkOpen(d('2026-12-15'), at('2026-12-30'))).toBe(false);
  });
});

describe('contact', () => {
  it('tells real addresses from the platforms’ relay addresses', () => {
    expect(emailKind('ana@gmail.com')).toBe('real');
    expect(emailKind('ana-4f2a@guest.airbnb.com')).toBe('relay');
    expect(emailKind('x123@guest.booking.com')).toBe('relay');
    expect(emailKind('lodgify-guest-12@malodge.local')).toBe('none');
    expect(emailKind(null)).toBe('none');
  });
});

describe('guest journey', () => {
  const ci = d('2026-12-10');
  const co = d('2026-12-15');
  it('welcomes as soon as the stay is known', () => {
    expect(dueStep(ci, co, {}, at('2026-11-20'))).toBe('welcome');
    expect(dueStep(ci, co, { welcome: { at: '2026-11-20T09:00:00Z', channel: 'email' } }, at('2026-11-21'))).toBeNull();
  });
  it('suggests extras a week before, not right after the welcome', () => {
    const welcomed = { welcome: { at: '2026-11-20T09:00:00Z', channel: 'email' } };
    expect(dueStep(ci, co, welcomed, at('2026-12-03'))).toBe('j7');
    expect(dueStep(ci, co, { welcome: { at: '2026-12-03T09:00:00Z', channel: 'email' } }, at('2026-12-04'))).toBeNull();
  });
  it('sends the arrival information the day before (or the day of) arrival', () => {
    const sent = { welcome: { at: '2026-11-20T09:00:00Z', channel: 'email' }, j7: { at: '2026-12-03T09:00:00Z', channel: 'email' } };
    expect(dueStep(ci, co, sent, at('2026-12-09'))).toBe('j1');
    expect(dueStep(ci, co, sent, at('2026-12-10'))).toBe('j1');
    // Booked at the last minute: the arrival message comes first.
    expect(dueStep(ci, co, {}, at('2026-12-09'))).toBe('j1');
  });
  it('thanks the guest 1 to 3 days after departure, once', () => {
    expect(dueStep(ci, co, {}, at('2026-12-14'))).toBe('welcome');
    expect(dueStep(ci, co, {}, at('2026-12-16'))).toBe('thanks');
    expect(dueStep(ci, co, { thanks: { at: '2026-12-16T09:00:00Z', channel: 'email' } }, at('2026-12-17'))).toBeNull();
    expect(dueStep(ci, co, {}, at('2026-12-20'))).toBeNull();
  });
  it('writes the message with the link, the arrival time and the contact', () => {
    const ctx = { firstName: 'Ana', villa: 'Villa 58', checkIn: ci, checkOut: co, url: 'https://app/sejour/x', guide: { checkInTime: '16:00', contactName: 'Youssef', contactPhone: '+212 600' }, servicesCount: 4 };
    expect(message('welcome', ctx).subject).toBe('Bienvenue à Villa 58');
    const j1 = whatsappText('j1', ctx);
    expect(j1).toContain('à partir de 16:00');
    expect(j1).toContain('Youssef, +212 600');
    expect(j1).toContain('https://app/sejour/x');
  });
});
