import { describe, expect, it } from 'vitest';
import { houseLabel, listingLabel } from './villaName';

describe('villa names', () => {
  it('names the house without a formula’s rooms, the stay with its own', () => {
    expect(houseLabel('LA VILLA 58 - Marrakech - Ecolodge - 5 chambres', true)).toBe('LA VILLA 58 - Marrakech - Ecolodge');
    expect(houseLabel('Villa Sable - 3 chambres', false)).toBe('Villa Sable - 3 chambres');
    expect(listingLabel({ name: 'LA VILLA 58 - Ecolodge - Marrakech', bedrooms: 7 }, true)).toBe('LA VILLA 58 - Ecolodge - Marrakech - 7 chambres');
    expect(listingLabel({ name: 'LA VILLA 58 - Marrakech - Ecolodge - 5 chambres', bedrooms: 5 }, true)).toBe('LA VILLA 58 - Marrakech - Ecolodge - 5 chambres');
  });
});
