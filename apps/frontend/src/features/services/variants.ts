/**
 * Groups catalogue entries that are variants of one activity
 * ("… - 1 à 3 pers." / "… - 4 à 7 pers.", "… — basse saison" / "… — haute saison",
 * "… - aller" / "… - aller et retour"…) so the catalogue shows one card per activity.
 * Display only: every variant stays a separate, orderable service.
 */
const SUFFIXES: { re: RegExp; label: (m: RegExpMatchArray) => string }[] = [
  // note kept apart: "— Sur place - hors transferts"
  { re: /\s*[—–-]\s*sur place\s*-\s*hors transferts\.?\s*$/i, label: () => 'sur place, hors transferts' },
  { re: /\s*[—–-]\s*(départ et retour [^—–-]+)$/i, label: (m) => m[1].trim() },
  { re: /\s*[—–-]?\s*\b(groupe\s+)?(\d+\s*à\s*\d+|\d+)\s*pers(?:\.|onnes?)?\s*$/i, label: (m) => `${m[2].replace(/\s+/g, ' ')} pers.` },
  { re: /\s*[—–-]\s*par\s+personne\s*$/i, label: () => 'par personne' },
  { re: /\s*[—–-]\s*(basse|haute)\s+saison\s*$/i, label: (m) => `${m[1].toLowerCase()} saison` },
  { re: /\s*[—–-]\s*(jour|nuit)\s*$/i, label: (m) => m[1].toLowerCase() },
  { re: /\s*[—–-]\s*(aller et retour|aller\s*\/\s*retour|aller|retour)\s*$/i, label: (m) => m[1].toLowerCase() },
];

export function splitVariant(name: string): { base: string; variant: string } {
  let base = name.trim();
  const parts: string[] = [];
  for (let guard = 0; guard < 6; guard++) {
    const hit = SUFFIXES.map((s) => ({ s, m: base.match(s.re) })).find((x) => x.m && x.m.index! > 3);
    if (!hit) break;
    parts.unshift(hit.s.label(hit.m!));
    base = base.slice(0, hit.m!.index).replace(/[\s—–-]+$/, '').trim();
  }
  return { base, variant: parts.join(' · ') };
}

export interface ActivityGroup<T> {
  key: string;
  name: string;
  category: string;
  items: (T & { variant: string })[];
}

export function groupActivities<T extends { name: string; category?: { name: string } | null }>(services: T[]): ActivityGroup<T>[] {
  const map = new Map<string, ActivityGroup<T>>();
  for (const s of services) {
    const { base, variant } = splitVariant(s.name);
    const category = s.category?.name ?? '';
    const key = `${category}|${base.toLowerCase()}`;
    const g = map.get(key) ?? { key, name: base, category, items: [] };
    g.items.push({ ...s, variant });
    map.set(key, g);
  }
  const firstNumber = (v: string) => Number(v.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  for (const g of map.values()) {
    g.items.sort((a, b) => firstNumber(a.variant) - firstNumber(b.variant) || a.variant.localeCompare(b.variant, 'fr'));
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
