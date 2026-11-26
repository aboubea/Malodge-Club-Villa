/**
 * Country names are stored in one spelling only (French, as in the app's
 * country list): "Morocco" from Lodgify and "Maroc" from the extras file are
 * the same country, so villas, filters and user restrictions all match.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

const CANONICAL: [RegExp, string][] = [
  [/^(maroc|morocco|ma|mar|kingdom of morocco|royaume du maroc)$/, 'Maroc'],
  [/^(france|fr|fra)$/, 'France'],
  [/^(espagne|spain|espana|es|esp)$/, 'Espagne'],
  [/^(italie|italy|italia|it|ita)$/, 'Italie'],
  [/^(portugal|pt|prt)$/, 'Portugal'],
  [/^(tunisie|tunisia|tn|tun)$/, 'Tunisie'],
  [/^(emirats arabes unis|united arab emirates|uae|ae|are)$/, 'Émirats Arabes Unis'],
];

/** The app's spelling of a country (unknown names are kept, trimmed). */
export function canonicalCountry(country: string | null | undefined): string {
  const raw = (country ?? '').trim();
  if (!raw) return raw;
  const n = norm(raw);
  return CANONICAL.find(([re]) => re.test(n))?.[1] ?? raw;
}

/** Same list, one spelling per country, no duplicates. */
export function canonicalCountries(list: string[] | null | undefined): string[] {
  return [...new Set((list ?? []).map(canonicalCountry).filter(Boolean))];
}
