import { describe, expect, it } from 'vitest';
import { formulaRooms, houseLabel, listingLabel, withoutRooms } from './villa-name';

describe('villa names (house and formulas)', () => {
  it('drops the room count of the house’s main listing', () => {
    expect(withoutRooms('LA VILLA 58 - Marrakech - Ecolodge - 5 chambres')).toBe('LA VILLA 58 - Marrakech - Ecolodge');
    expect(withoutRooms('Villa 58 – 3 ch.')).toBe('Villa 58');
    expect(withoutRooms('Villa Atlas (4 chambres)')).toBe('Villa Atlas');
    expect(withoutRooms('Riad Al Amana')).toBe('Riad Al Amana');
    // A name made only of a room count is kept as it is.
    expect(withoutRooms('5 chambres')).toBe('5 chambres');
  });

  it('labels a house without a formula’s rooms only when it has formulas', () => {
    expect(houseLabel('LA VILLA 58 - Marrakech - 5 chambres', true)).toBe('LA VILLA 58 - Marrakech');
    expect(houseLabel('Villa Sable - 3 chambres', false)).toBe('Villa Sable - 3 chambres');
  });

  it('names the listing a stay was booked on with its own room count', () => {
    // The 7-room formula whose Lodgify name doesn't say it.
    expect(listingLabel({ name: 'LA VILLA 58 - Ecolodge - Marrakech', bedrooms: 7 }, true)).toBe('LA VILLA 58 - Ecolodge - Marrakech - 7 chambres');
    // The house's own listing already says 5 rooms: unchanged.
    expect(listingLabel({ name: 'LA VILLA 58 - Marrakech - Ecolodge - 5 chambres', bedrooms: 5 }, true)).toBe('LA VILLA 58 - Marrakech - Ecolodge - 5 chambres');
    // Rooms unknown (1 is Lodgify's default) or a house without formulas: the name only.
    expect(listingLabel({ name: 'Villa 58 - Ecolodge', bedrooms: 1 }, true)).toBe('Villa 58 - Ecolodge');
    expect(listingLabel({ name: 'Villa Sable', bedrooms: 4 }, false)).toBe('Villa Sable');
  });

  it('gives the formula alone', () => {
    expect(formulaRooms({ name: 'LA VILLA 58 - Ecolodge - Marrakech', bedrooms: 7 })).toBe('7 chambres');
    expect(formulaRooms({ name: 'Villa 58 - 5 chambres', bedrooms: 1 })).toBe('5 chambres');
    expect(formulaRooms({ name: 'Villa 58', bedrooms: 1 })).toBeNull();
  });
});
