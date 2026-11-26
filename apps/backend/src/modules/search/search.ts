/** Matching for the global search: accents and case ignored, best matches first. */
export const norm = (v: string | null | undefined) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * How well `texts` match the query (0 = no match): every word of the query must be found;
 * a text starting with the query scores best, then a word starting with it, then anywhere.
 */
export function score(query: string, texts: (string | null | undefined)[]): number {
  const q = norm(query);
  if (!q) return 0;
  const words = q.split(' ');
  const hay = texts.map(norm).filter(Boolean);
  const all = hay.join(' ');
  if (!words.every((w) => all.includes(w))) return 0;
  let best = 1;
  for (const h of hay) {
    if (h === q) best = Math.max(best, 4);
    else if (h.startsWith(q)) best = Math.max(best, 3);
    else if (h.split(/[\s\-–,.'’/]+/).some((w) => w.startsWith(words[0]))) best = Math.max(best, 2);
  }
  return best;
}
