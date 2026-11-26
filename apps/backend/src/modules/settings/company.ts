import { BadRequestException } from '@nestjs/common';

/** The company's details, set in Paramètres › Général: its name signs the e-mails and documents. */
export interface Company {
  name: string;
  supportEmail: string;
  phone: string;
  website: string;
}

export const DEFAULT_COMPANY: Company = { name: 'Malodge Club Villa', supportEmail: '', phone: '', website: '' };

/** The name the e-mails and documents were written with: replaced by the company's name once it is set. */
export const BUILT_IN_NAMES = ['Malodge Club Villa', 'Malodge Club'];

const oneLine = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

/** Checks and tidies what was typed; refuses what can't be used. */
export function cleanCompany(input: unknown): Company {
  const i = (input ?? {}) as Record<string, unknown>;
  // No < > " in the name: it goes in the e-mails' sender ("Name <address>").
  const name = oneLine(i.name, 80).replace(/[<>"]/g, '');
  if (name.length < 2) throw new BadRequestException('Le nom de l’entreprise doit faire au moins 2 caractères.');
  const supportEmail = oneLine(i.supportEmail, 120).toLowerCase();
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new BadRequestException('E-mail de support invalide.');
  const phone = oneLine(i.phone, 40);
  if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) throw new BadRequestException('Téléphone invalide : chiffres, espaces et + seulement.');
  let website = oneLine(i.website, 200);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!u.hostname.includes('.')) throw new Error();
      website = u.toString().replace(/\/$/, '');
    } catch {
      throw new BadRequestException('Site web invalide (ex. malodge.com).');
    }
  }
  return { name, supportEmail, phone, website };
}

/** A stored value read back (defaults for what is missing; never throws). */
export function readCompany(stored: unknown): Company {
  try {
    return cleanCompany({ ...DEFAULT_COMPANY, ...((stored ?? {}) as object) });
  } catch {
    return { ...DEFAULT_COMPANY };
  }
}

/** Puts the company's name where a text says the built-in one (e-mail subjects and bodies, documents). */
export function withCompanyName(text: string, name: string | null | undefined): string {
  if (!name || BUILT_IN_NAMES.includes(name)) return text;
  // One pass, the longer name first: "Malodge Club Villa" is not left as "<name> Villa", and a
  // new name that contains the old one ("Malodge Club Marrakech") is not replaced again.
  return text.replace(/Malodge Club Villa|Malodge Club/g, () => name);
}
