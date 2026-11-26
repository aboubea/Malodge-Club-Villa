import { describe, expect, it } from 'vitest';
import { formulaSuggestions } from './formulaSuggestions';

const v = (id: string, name: string, city = 'Marrakech', logifyId: string | null = id, parentVillaId: string | null = null) => ({ id, name, city, logifyId, parentVillaId }) as any;

describe('formulas of one house to group', () => {
  it('proposes the longer Lodgify listing as a formula of the shorter one, same city', () => {
    const pairs = formulaSuggestions([v('a', 'Villa 58'), v('b', 'Villa 58 - 3 chambres'), v('c', 'Riad Al Amana')]);
    expect(pairs).toEqual([{ main: expect.objectContaining({ id: 'a' }), formula: expect.objectContaining({ id: 'b' }) }]);
  });

  it('leaves alone other cities, villas outside Lodgify and formulas already grouped', () => {
    expect(formulaSuggestions([v('a', 'Villa 58'), v('b', 'Villa 58 - 3 chambres', 'Agadir')])).toEqual([]);
    expect(formulaSuggestions([v('a', 'Villa 58'), v('b', 'Villa 58 - 3 chambres', 'Marrakech', null)])).toEqual([]);
    expect(formulaSuggestions([v('a', 'Villa 58'), v('b', 'Villa 58 - 3 chambres', 'Marrakech', 'b', 'a')])).toEqual([]);
  });

  it('does not pair different houses sharing a word', () => {
    expect(formulaSuggestions([v('a', 'Villa Beldi'), v('b', 'Villa Apricot')])).toEqual([]);
  });
});
