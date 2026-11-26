/**
 * Capacity of a Lodgify listing: guests, bedrooms and bathrooms.
 *
 * Lodgify spreads these numbers over several payloads (the property list, the
 * property itself and its room types) and does not always fill them, so each
 * figure is taken from the first source that has it:
 *   1. a field of the property (detail, then list item);
 *   2. the room types, added up (a whole villa is usually one room type);
 *   3. the listing's own text ("4 chambres", "sleeps 8", "3 bathrooms"…).
 * A figure found nowhere stays null: it is never invented.
 */

export type CapacitySource = 'lodgify' | 'rooms' | 'description';

export interface Capacity {
  maxGuests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** Where each figure came from (null when not found). */
  source: { maxGuests: CapacitySource | null; bedrooms: CapacitySource | null; bathrooms: CapacitySource | null };
}

type Field = 'maxGuests' | 'bedrooms' | 'bathrooms';

/** Field names (lower case, letters and digits only) that hold each figure, best first. */
const KEYS: Record<Field, string[]> = {
  maxGuests: [
    'maxpeople', 'peoplecapacity', 'maxguests', 'maxoccupancy', 'maxpersons', 'maxpeoplecapacity', 'guestsmax',
    'accommodates', 'accommodation', 'sleeps', 'occupancy', 'capacity', 'maxcapacity', 'guestcapacity', 'maxadults',
  ],
  bedrooms: ['bedrooms', 'bedroomsnumber', 'numberofbedrooms', 'bedroomcount', 'bedroomscount', 'numbedrooms', 'nbbedrooms', 'totalbedrooms'],
  bathrooms: [
    'bathrooms', 'bathroomsnumber', 'numberofbathrooms', 'bathroomcount', 'bathroomscount', 'numbathrooms', 'nbbathrooms', 'totalbathrooms',
    'fullbathrooms',
  ],
};

/** Plausible range of each figure: anything outside is a wrong field, not a house. */
const MAX: Record<Field, number> = { maxGuests: 100, bedrooms: 50, bathrooms: 50 };

/** Containers that never describe the whole house. */
const SKIP = new Set(['images', 'photos', 'inout', 'rates', 'prices', 'calendar', 'availability', 'reviews', 'beds', 'addons', 'contact']);

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A count from a number, a numeric string, a list of items or an object such as `{ max: 8 }`. */
export function toCount(v: unknown): number | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  // A head count is a whole number: 0.8 is a rate, not a capacity.
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d+)(?![.,]\d)/);
    return m ? parseInt(m[1], 10) : null;
  }
  if (Array.isArray(v)) {
    if (!v.length) return null;
    // A list of room entries: each one counts, or counts `amount` times.
    return v.reduce((sum: number, item) => {
      const n = item && typeof item === 'object' ? toCount((item as any).amount ?? (item as any).count ?? (item as any).quantity) : null;
      return sum + (n !== null && n > 0 ? n : 1);
    }, 0);
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['max', 'maximum', 'total', 'count', 'number', 'amount', 'value', 'quantity', 'people', 'guests']) {
      const n = toCount(o[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

const valid = (field: Field, n: number | null) => n !== null && n > 0 && n <= MAX[field];

/** The figure stored on an object, looking at its own fields first, then one or two levels down. */
export function findField(obj: unknown, field: Field, depth = 2): number | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const entries = Object.entries(obj as Record<string, unknown>).map(([k, v]) => [normKey(k), v] as const);
  for (const key of KEYS[field]) {
    const hit = entries.find(([k]) => k === key);
    if (hit) {
      const n = toCount(hit[1]);
      if (valid(field, n)) return n;
    }
  }
  if (depth <= 0) return null;
  for (const [k, v] of entries) {
    if (SKIP.has(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const n = findField(v, field, depth - 1);
    if (n !== null) return n;
  }
  return null;
}

/** Room types add up: two rooms of 2 guests each make a house of 4. */
export function fromRoomTypes(rooms: unknown[], field: Field): number | null {
  let total = 0;
  for (const r of rooms) {
    const n = findField(r, field, 1);
    if (n === null) continue;
    // A room type standing for several identical units counts once per unit.
    const units = toCount((r as any)?.units ?? (r as any)?.quantity);
    total += n * (units && units > 0 && units <= 20 ? units : 1);
  }
  return valid(field, total) ? total : null;
}

/* ───────────────────────────── From the text ───────────────────────────── */

const WORDS: Record<string, number> = {
  un: 1, une: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4, cinq: 5, five: 5, six: 6,
  sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10, onze: 11, eleven: 11, douze: 12, twelve: 12,
  treize: 13, thirteen: 13, quatorze: 14, fourteen: 14, quinze: 15, fifteen: 15, seize: 16, sixteen: 16, vingt: 20, twenty: 20,
};
const NUM = `(\\d{1,3}|${Object.keys(WORDS).join('|')})`;

const PATTERNS: Record<Field, RegExp[]> = {
  bedrooms: [
    new RegExp(`\\b${NUM}[\\s-]*(?:bedrooms?|bed rooms?|chambres?|suites?)\\b`, 'g'),
    /\b(\d{1,2})\s*(?:br|bdr|bdrm)\b/g,
  ],
  bathrooms: [
    new RegExp(`\\b${NUM}[\\s-]*(?:bathrooms?|bath rooms?|baths?|shower rooms?|salles? de bains?|salles? d eau|sdb)\\b`, 'g'),
  ],
  maxGuests: [
    new RegExp(`\\b${NUM}[\\s-]*(?:guests?|people|persons?|personnes?|pers|voyageurs?|adults?|adultes?|couchages?|hotes|pax)\\b`, 'g'),
    new RegExp(`\\b(?:sleeps|accommodates|accueille)\\s+(?:up to\\s+|jusqu a\\s+)?${NUM}\\b`, 'g'),
  ],
};

/** Plain, accent-free, lower-case text of an HTML description. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;|&rsquo;|[’‘`]/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ');
}

/** The figure stated in a listing's text: the largest one, since the total is usually given ("5 chambres dont 2 suites"). */
export function fromText(text: string, field: Field): number | null {
  const t = plainText(text);
  let best: number | null = null;
  for (const re of PATTERNS[field]) {
    for (const m of t.matchAll(re)) {
      const raw = m[1];
      const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : WORDS[raw] ?? null;
      if (valid(field, n) && (best === null || n! > best)) best = n;
    }
  }
  return best;
}

/* ─────────────────────────────── Together ─────────────────────────────── */

export function extractCapacity(input: {
  /** Property payloads, most detailed first (property by id, then list item). */
  properties: unknown[];
  /** Room types of the property. */
  rooms: unknown[];
  /** Name, description… of the listing. */
  texts: (string | null | undefined)[];
}): Capacity {
  const text = input.texts.filter(Boolean).join(' \n ');
  const out: Capacity = { maxGuests: null, bedrooms: null, bathrooms: null, source: { maxGuests: null, bedrooms: null, bathrooms: null } };
  for (const field of ['maxGuests', 'bedrooms', 'bathrooms'] as Field[]) {
    const fromProps = input.properties.map((p) => findField(p, field)).find((n) => n !== null) ?? null;
    if (fromProps !== null) {
      out[field] = fromProps;
      out.source[field] = 'lodgify';
      continue;
    }
    const fromRooms = input.rooms.length ? fromRoomTypes(input.rooms, field) : null;
    if (fromRooms !== null) {
      out[field] = fromRooms;
      out.source[field] = 'rooms';
      continue;
    }
    const fromDesc = text ? fromText(text, field) : null;
    if (fromDesc !== null) {
      out[field] = fromDesc;
      out.source[field] = 'description';
    }
  }
  return out;
}
