import {
  BedDouble,
  Bike,
  CalendarDays,
  Car,
  CarFront,
  Dumbbell,
  Flag,
  Flower2,
  Footprints,
  Mountain,
  Plane,
  Ship,
  ShoppingCart,
  Sparkles,
  SprayCan,
  Sunrise,
  UtensilsCrossed,
  Waves,
  Wrench,
} from 'lucide-react';

export interface ActivityKind {
  key: string;
  label: string;
  icon: React.ElementType;
  /** Chip colours (token classes). */
  tone: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Kinds of activity, first match wins (on the service name, then its category). */
const KINDS: (ActivityKind & { match: RegExp })[] = [
  {
    key: 'airport',
    label: 'Transfert aéroport',
    icon: Plane,
    tone: 'bg-info/10 text-info border-info/25',
    match: /aeroport|airport|aerogare/,
  },
  {
    key: 'balloon',
    label: 'Montgolfière',
    icon: Sunrise,
    tone: 'bg-gold/20 text-accent border-gold/40',
    match: /montgolfiere|balloon/,
  },
  {
    key: 'quad',
    label: 'Quad / buggy',
    icon: Bike,
    tone: 'bg-copper/10 text-copper border-copper/25',
    match: /\bquad|buggy|moto|velo|bike/,
  },
  {
    key: 'camel',
    label: 'Dromadaire / cheval',
    icon: Footprints,
    tone: 'bg-copper/10 text-copper border-copper/25',
    match: /chameau|dromadaire|camel|cheval|equitation/,
  },
  {
    key: 'spa',
    label: 'Bien-être',
    icon: Flower2,
    tone: 'bg-plum/10 text-plum border-plum/25',
    match: /massage|spa|hammam|soin|beaute|manucure|coiffure|yoga|bien etre/,
  },
  {
    key: 'food',
    label: 'Repas / chef',
    icon: UtensilsCrossed,
    tone: 'bg-success/10 text-success border-success/25',
    match: /chef|repas|diner|dejeuner|petit dej|traiteur|cuisine|restaurant|restauration|brunch|cours de cuisine/,
  },
  {
    key: 'excursion',
    label: 'Excursion',
    icon: Mountain,
    tone: 'bg-accent/10 text-accent border-accent/25',
    match: /excursion|circuit|visite|randonnee/,
  },
  {
    key: 'boat',
    label: 'Nautique',
    icon: Ship,
    tone: 'bg-info/10 text-info border-info/25',
    match: /bateau|boat|jet ski|surf|plongee|nautique/,
  },
  {
    key: 'pool',
    label: 'Piscine',
    icon: Waves,
    tone: 'bg-info/10 text-info border-info/25',
    match: /piscine|pool/,
  },
  {
    key: 'car',
    label: 'Location de voiture',
    icon: CarFront,
    tone: 'bg-ink/5 text-ink-soft border-line-strong',
    match: /location (de )?(voiture|vehicule)|location auto/,
  },
  {
    key: 'transfer',
    label: 'Transfert / chauffeur',
    icon: Car,
    tone: 'bg-ink/5 text-ink-soft border-line-strong',
    match: /transfert|transport|navette|chauffeur|taxi|minibus/,
  },
  {
    key: 'cleaning',
    label: 'Ménage',
    icon: SprayCan,
    tone: 'bg-surface-2 text-ink-soft border-line',
    match: /menage|nettoyage|linge|blanchisserie|entretien/,
  },
  {
    key: 'shopping',
    label: 'Courses',
    icon: ShoppingCart,
    tone: 'bg-surface-2 text-ink-soft border-line',
    match: /courses|epicerie|livraison|shopping/,
  },
  {
    key: 'golf',
    label: 'Golf',
    icon: Flag,
    tone: 'bg-success/10 text-success border-success/25',
    match: /golf/,
  },
  {
    key: 'sport',
    label: 'Sport',
    icon: Dumbbell,
    tone: 'bg-success/10 text-success border-success/25',
    match: /sport|coach|fitness|tennis|padel/,
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    icon: Wrench,
    tone: 'bg-copper/10 text-copper border-copper/25',
    match: /maintenance|reparation|plomberie|electricite|technique/,
  },
];

/** Place names: an excursion, unless the name or the category already says what it is. */
const PLACES = /vallee|ourika|agafay|desert|imlil|atlas|essaouira|ouzoud/;

const OTHER: ActivityKind = {
  key: 'other',
  label: 'Autre activité',
  icon: Sparkles,
  tone: 'bg-plum/10 text-plum border-plum/25',
};

/** The kind of an activity from its service name and category. */
export function activityKind(name?: string | null, category?: string | null): ActivityKind {
  const n = norm(name ?? '');
  const c = norm(category ?? '');
  const byKey = (key: string) => KINDS.find((k) => k.key === key)!;
  // "Transfert …" is a transfer whatever its destination (excursion, villa…).
  if (/^transferts?\b/.test(n) && !byKey('airport').match.test(n)) return byKey('transfer');
  return KINDS.find((k) => k.match.test(n)) ?? KINDS.find((k) => k.match.test(c)) ?? (PLACES.test(n) ? byKey('excursion') : OTHER);
}

/** Pax, price and timing details: in the detail panel, not on the chip. */
const DETAIL = /\bpers\b|\bpersonnes?\b|\bprix\b|^(jour|nuit|aller|retour|aller et retour|sur place|hors transferts?)$|^\d+\s*h\b/i;

/**
 * What the chip says next to its icon: the name without what the icon already tells
 * ("Transfert aéroport - Amelkis - 1 à 3 pers." → "Amelkis") nor pax or price details.
 */
export function chipLabel(name: string): string {
  const parts = name
    .split(/\s+[-–—]\s+/)
    .map((p) =>
      p
        .replace(/\([^)]*\)/g, '')
        .replace(/\s*\d+\s*(à\s*\d+\s*)?pers\.?$/i, '')
        .replace(/^(?:[Tt]ransferts?|[Ee]xcursion|[Nn]avette)\s+(?=[A-ZÀ-Ý0-9]|a[ée]roport)/, '')
        .replace(/\s*\ba[ée]roport\b\s*/gi, ' ')
        .trim(),
    )
    .filter((p) => p && !DETAIL.test(p));
  return parts[0] || name;
}

export const STAY_ICON = BedDouble;
export const EVENT_ICON = CalendarDays;
export const MAINTENANCE_ICON = Wrench;
