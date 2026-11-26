/**
 * Fuzzy matching of villa names, to spot the same house listed under two names
 * (e.g. "VILLA APRICOT" in the extras spreadsheet and
 * "Villa Apricot - Amelkis - Golf Amelkis" synced from Lodgify).
 */

/** Words that do not identify a house on their own. */
const STOP = new Set([
  'la', 'le', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'a', 'au', 'aux', 'al', 'el', 'the', 'of', 'and',
  'villa', 'villas', 'riad', 'dar', 'maison', 'house', 'home', 'lodge', 'ecolodge', 'residence', 'appartement', 'apartment',
  'marrakech', 'marrakesh', 'maroc', 'morocco', 'medina',
  'chambre', 'chambres', 'ch', 'bedroom', 'bedrooms', 'pers', 'personnes', 'people', 'golf',
]);

export function villaTokens(name: string): string[] {
  const tokens = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t));
  return [...new Set(tokens)];
}

/**
 * Share of the shorter name's distinctive words found in the other name (0 → 1).
 * 1 means every distinctive word of one name appears in the other.
 */
export function villaSimilarity(a: string, b: string): number {
  const ta = villaTokens(a);
  const tb = villaTokens(b);
  if (!ta.length || !tb.length) return 0;
  const common = ta.filter((t) => tb.includes(t));
  // A lone short word in common ("5", "ii") is not enough evidence.
  if (!common.some((t) => t.length >= 4 || (/^\d+$/.test(t) && t.length >= 2))) return 0;
  return common.length / Math.min(ta.length, tb.length);
}

export interface VillaCandidate {
  id: string;
  name: string;
  score: number;
}

/** Likely duplicates of `name` among `villas`, best first (score ≥ 0.5). */
export function villaCandidates(name: string, villas: { id: string; name: string }[]): VillaCandidate[] {
  return villas
    .map((v) => ({ id: v.id, name: v.name, score: villaSimilarity(name, v.name) }))
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score || villaTokens(a.name).length - villaTokens(b.name).length);
}

/** A single, complete match — safe to attach automatically. */
export function uniqueVillaMatch(name: string, villas: { id: string; name: string }[]): VillaCandidate | null {
  const full = villaCandidates(name, villas).filter((c) => c.score === 1);
  return full.length === 1 ? full[0] : null;
}
