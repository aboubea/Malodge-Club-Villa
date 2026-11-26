import { describe, expect, it } from 'vitest';
import { cleanCompany, readCompany, withCompanyName } from './company';

describe('company details', () => {
  it('keeps what was typed, tidied', () => {
    expect(cleanCompany({ name: '  Malodge   Marrakech ', supportEmail: 'Contact@Malodge.com', phone: '+212 6 00 00 00 00', website: 'malodge.com/' })).toEqual({
      name: 'Malodge Marrakech',
      supportEmail: 'contact@malodge.com',
      phone: '+212 6 00 00 00 00',
      website: 'https://malodge.com',
    });
    // Nothing that could break the e-mails' sender.
    expect(cleanCompany({ name: 'Ma "Villa" <x>' }).name).toBe('Ma Villa x');
  });

  it('refuses what can’t be used', () => {
    expect(() => cleanCompany({ name: ' ' })).toThrow(/au moins 2/);
    expect(() => cleanCompany({ name: 'Malodge', supportEmail: 'pas-un-mail' })).toThrow(/E-mail/);
    expect(() => cleanCompany({ name: 'Malodge', phone: 'abc' })).toThrow(/Téléphone/);
    expect(() => cleanCompany({ name: 'Malodge', website: 'http://' })).toThrow(/Site web/);
  });

  it('reads back a stored value with defaults', () => {
    expect(readCompany(null).name).toBe('Malodge Club Villa');
    expect(readCompany({ name: 'Riad Concierge' })).toMatchObject({ name: 'Riad Concierge', supportEmail: '' });
  });

  it('signs e-mails and documents with the company’s name', () => {
    expect(withCompanyName('Bienvenue sur Malodge Club', 'Riad Concierge')).toBe('Bienvenue sur Riad Concierge');
    expect(withCompanyName('Malodge Club Villa — Relevé', 'Riad Concierge')).toBe('Riad Concierge — Relevé');
    expect(withCompanyName('Votre espace Malodge Club', 'Malodge Club Marrakech')).toBe('Votre espace Malodge Club Marrakech');
    expect(withCompanyName('Bienvenue sur Malodge Club', null)).toBe('Bienvenue sur Malodge Club');
  });
});
