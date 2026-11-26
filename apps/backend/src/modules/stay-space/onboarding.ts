import { signLink } from '../../common/security/secrets';

/* ───────────────────────────── Welcome booklet ───────────────────────────── */

/** The villa's welcome booklet, filled on the villa card (all fields optional). */
export interface WelcomeGuide {
  welcome?: string;
  checkInTime?: string;
  checkOutTime?: string;
  address?: string;
  directions?: string;
  /** Keys, codes, caretaker: shown to the guest only from 2 days before arrival. */
  access?: string;
  wifiName?: string;
  /** Shown to the guest only from 2 days before arrival. */
  wifiPassword?: string;
  rules?: string;
  practical?: string;
  contactName?: string;
  contactPhone?: string;
  emergency?: string;
  /** Welcome, J-7, J-1 and thank-you e-mails sent by themselves for this villa. */
  autoMessages?: boolean;
}

const TEXT_FIELDS: (keyof WelcomeGuide)[] = ['welcome', 'checkInTime', 'checkOutTime', 'address', 'directions', 'access', 'wifiName', 'wifiPassword', 'rules', 'practical', 'contactName', 'contactPhone', 'emergency'];
export const SENSITIVE_FIELDS: (keyof WelcomeGuide)[] = ['access', 'wifiPassword'];

/** Only the known fields, trimmed, with sensible lengths. */
export function cleanGuide(input: unknown): WelcomeGuide {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: WelcomeGuide = {};
  for (const k of TEXT_FIELDS) {
    const v = typeof src[k] === 'string' ? (src[k] as string).trim() : '';
    if (v) (out as any)[k] = v.slice(0, k === 'welcome' || k === 'rules' || k === 'practical' || k === 'directions' || k === 'access' ? 3000 : 300);
  }
  if (src.autoMessages === true) out.autoMessages = true;
  return out;
}

/** A booklet worth sending: at least the arrival time or the address, and a contact. */
export function guideReady(g: WelcomeGuide) {
  return !!((g.checkInTime || g.address) && g.contactPhone);
}

const DAY = 86_400_000;
const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY);

/** Access codes and Wi-Fi password: from 2 days before arrival until departure only. */
export function sensitiveVisible(checkIn: Date | null, checkOut: Date | null, now = new Date()) {
  if (!checkIn || !checkOut) return false;
  const today = dayNumber(now);
  return today >= dayNumber(checkIn) - 2 && today <= dayNumber(checkOut);
}

/** The booklet as the guest may see it today. */
export function guideForGuest(g: WelcomeGuide, checkIn: Date | null, checkOut: Date | null, now = new Date()) {
  const visible = sensitiveVisible(checkIn, checkOut, now);
  const shown: WelcomeGuide = { ...g };
  delete shown.autoMessages;
  const hidden: string[] = [];
  if (!visible) {
    for (const k of SENSITIVE_FIELDS) {
      if (shown[k]) hidden.push(k);
      delete shown[k];
    }
  }
  const from = checkIn ? new Date((dayNumber(checkIn) - 2) * DAY).toISOString().slice(0, 10) : null;
  return { guide: shown, hidden, sensitiveFrom: hidden.length ? from : null };
}

/* ───────────────────────────── Personal stay link ───────────────────────────── */

export function stayToken(reservationId: string, version: number) {
  return `${reservationId}.${version}.${signLink(`stay:${reservationId}:${version}`)}`;
}

export function parseStayToken(token: string | null | undefined): { reservationId: string; version: number } | null {
  const m = /^([a-z0-9]+)\.(\d{1,6})\.([A-Za-z0-9_-]{20,64})$/.exec(token ?? '');
  if (!m) return null;
  const version = Number(m[2]);
  return signLink(`stay:${m[1]}:${version}`) === m[3] ? { reservationId: m[1], version } : null;
}

/** The link works until 14 days after departure (to see the requests and say thanks). */
export function stayLinkOpen(checkOut: Date | null, now = new Date()) {
  return !checkOut || dayNumber(now) <= dayNumber(checkOut) + 14;
}

/* ───────────────────────────── Contact ───────────────────────────── */

/** Booking platforms give addresses that relay to the guest through them (and may filter links). */
const RELAY = /@([a-z0-9-]+\.)*(airbnb\.com|booking\.com|expediapartnercentral\.com|homeaway\.com|vrbo\.com|abritel\.fr|tripadvisor\.com|agoda-messaging\.com)$/i;

export type EmailKind = 'real' | 'relay' | 'none';
export function emailKind(email: string | null | undefined): EmailKind {
  if (!email || /\.(invalid|local)$/i.test(email) || !email.includes('@')) return 'none';
  return RELAY.test(email.trim()) ? 'relay' : 'real';
}

export function whatsappNumber(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 8 ? digits : null;
}

/* ───────────────────────────── Journey ───────────────────────────── */

export type Step = 'welcome' | 'j7' | 'j1' | 'thanks';
export type Journey = Partial<Record<Step, { at: string; channel: string }>>;
export const STEPS: Step[] = ['welcome', 'j7', 'j1', 'thanks'];
export const STEP_LABEL: Record<Step, string> = { welcome: 'Bienvenue', j7: 'J-7 : extras', j1: 'J-1 : arrivée', thanks: 'Merci' };

/**
 * The message the guest should get today, if any:
 *  - welcome as soon as the stay is known (up to its last day);
 *  - J-7 (from 7 to 2 days before arrival) to suggest extras, unless the welcome went out in the last 2 days;
 *  - J-1 (the day before or the day of arrival) with the arrival information;
 *  - thanks from 1 to 3 days after departure.
 */
export function dueStep(checkIn: Date | null, checkOut: Date | null, journey: Journey, now = new Date()): Step | null {
  if (!checkIn || !checkOut) return null;
  const today = dayNumber(now);
  const toArrival = dayNumber(checkIn) - today;
  const afterDeparture = today - dayNumber(checkOut);
  if (afterDeparture >= 1) return afterDeparture <= 3 && !journey.thanks ? 'thanks' : null;
  if (toArrival <= 1) {
    if (toArrival >= 0 && !journey.j1) return 'j1';
    return !journey.welcome && !journey.j1 ? 'welcome' : null;
  }
  if (!journey.welcome) return 'welcome';
  const welcomeAge = today - dayNumber(new Date(journey.welcome.at));
  if (toArrival <= 7 && !journey.j7 && welcomeAge >= 2) return 'j7';
  return null;
}

/* ───────────────────────────── Messages ───────────────────────────── */

export interface MessageContext {
  firstName: string;
  villa: string;
  checkIn: Date | null;
  checkOut: Date | null;
  url: string;
  guide: WelcomeGuide;
  servicesCount: number;
}

const frDay = (d: Date | null) => (d ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');

/** Subject and text of each message (the same text serves for e-mail and WhatsApp). */
export function message(step: Step, c: MessageContext): { subject: string; title: string; lines: string[]; cta: string } {
  const hello = `Bonjour ${c.firstName},`;
  const contact = c.guide.contactPhone ? `${c.guide.contactName ? `${c.guide.contactName}, ` : ''}${c.guide.contactPhone}` : null;
  const services = c.servicesCount > 0 ? 'transferts, chef à domicile, activités… à réserver en quelques clics' : null;
  switch (step) {
    case 'welcome':
      return {
        subject: `Bienvenue à ${c.villa}`,
        title: `Bienvenue à ${c.villa}`,
        lines: [
          hello,
          `Votre séjour du ${frDay(c.checkIn)} au ${frDay(c.checkOut)} est confirmé, nous avons hâte de vous accueillir.`,
          `Votre espace séjour réunit le livret d’accueil de la villa${services ? ` et ses services (${services})` : ''}.`,
          c.guide.welcome ?? '',
        ].filter(Boolean),
        cta: 'Ouvrir mon espace séjour',
      };
    case 'j7':
      return {
        subject: `${c.villa} : plus qu’une semaine`,
        title: 'Plus qu’une semaine avant votre arrivée',
        lines: [
          hello,
          `Votre séjour à ${c.villa} commence le ${frDay(c.checkIn)}.`,
          services
            ? 'C’est le bon moment pour réserver le transfert depuis l’aéroport, un chef à domicile ou vos activités : tout se fait depuis votre espace séjour.'
            : 'Retrouvez toutes les informations utiles dans votre espace séjour.',
        ],
        cta: services ? 'Réserver mes extras' : 'Ouvrir mon espace séjour',
      };
    case 'j1':
      return {
        subject: `${c.villa} : informations d’arrivée`,
        title: 'Informations pour votre arrivée',
        lines: [
          hello,
          `Nous vous attendons ${c.checkIn && c.checkIn.getTime() <= Date.now() + 12 * 3600_000 ? 'aujourd’hui' : 'demain'} à ${c.villa}${c.guide.checkInTime ? `, à partir de ${c.guide.checkInTime}` : ''}.`,
          c.guide.address ? `Adresse : ${c.guide.address}` : '',
          'L’accès à la villa, le Wi-Fi et les informations pratiques sont dans votre espace séjour.',
          contact ? `Contact sur place : ${contact}` : '',
        ].filter(Boolean),
        cta: 'Voir mes informations d’arrivée',
      };
    case 'thanks':
      return {
        subject: `Merci pour votre séjour à ${c.villa}`,
        title: 'Merci pour votre séjour',
        lines: [hello, `Merci d’avoir séjourné à ${c.villa}. Nous espérons que tout vous a plu et serions heureux de vous accueillir à nouveau.`],
        cta: 'Revoir mon séjour',
      };
  }
}

/** The same message for WhatsApp (plain text with the link). */
export function whatsappText(step: Step, c: MessageContext) {
  const m = message(step, c);
  return [...m.lines, '', `${m.cta} : ${c.url}`].join('\n');
}
