import { VillaDto, villaSimilarity } from '@malodge/shared';
import type { GroupPair } from '../villas/VillaMerge';

type Villa = VillaDto & { parentVillaId?: string | null };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Lodgify listings that look like one house offered in several formulas
 * ("Villa 58" and "Villa 58 - 3 chambres"): every word of the shorter name in the
 * longer one, same city. The shorter name is proposed as the house.
 */
export function formulaSuggestions(villas: Villa[]): GroupPair[] {
  const lodgify = villas.filter((v) => v.logifyId && !v.parentVillaId);
  const out: GroupPair[] = [];
  const used = new Set<string>();
  for (const a of lodgify) {
    for (const b of lodgify) {
      if (a.id >= b.id || used.has(a.id) || used.has(b.id)) continue;
      if (norm(a.city ?? '') !== norm(b.city ?? '')) continue;
      if (villaSimilarity(a.name, b.name) < 1) continue;
      const [main, formula] = a.name.length <= b.name.length ? [a, b] : [b, a];
      out.push({ main, formula });
      used.add(formula.id);
    }
  }
  return out;
}
