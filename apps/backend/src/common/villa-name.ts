/**
 * Names of a house and of its Lodgify formulas (the same house offered with more or
 * fewer rooms, each its own listing). The house's main listing is often itself one
 * formula ("La Villa 58 - 5 chambres"): its room count must not label the house, nor
 * a stay booked on another formula (7 rooms).
 */

const SEPARATOR = /\s+[-–—|·•]\s+|\s*,\s+/;
const ROOMS = /^\(?\s*\d+\s*(chambres?|ch\.?|bedrooms?|br|rooms?|pi[eè]ces?)\s*\)?$/i;
const ROOMS_INSIDE = /\b\d+\s*(chambres?|ch\.|bedrooms?|rooms?)\b/i;

/** The name without its room-count part ("La Villa 58 - Marrakech - 5 chambres" → "La Villa 58 - Marrakech"). */
export function withoutRooms(name: string): string {
  const parts = name.split(SEPARATOR).map((p) => p.trim());
  const kept = parts.filter((p) => p && !ROOMS.test(p)).map((p) => p.replace(/\s*\(\s*\d+\s*(chambres?|ch\.?|bedrooms?|rooms?)\s*\)\s*$/i, '').trim());
  const out = kept.filter(Boolean).join(' - ');
  return out || name.trim();
}

/** A house's name: without a formula's room count when the house has formulas. */
export function houseLabel(name: string, hasFormulas: boolean): string {
  return hasFormulas ? withoutRooms(name) : name;
}

/**
 * The listing a stay was booked on, with its room count when the house has several
 * formulas and the listing's name doesn't say it ("La Villa 58 - Ecolodge" booked
 * as 7 rooms → "La Villa 58 - Ecolodge - 7 chambres").
 */
export function listingLabel(listing: { name: string; bedrooms?: number | null }, inFormulaGroup: boolean): string {
  if (!inFormulaGroup || ROOMS_INSIDE.test(listing.name)) return listing.name;
  const rooms = listing.bedrooms ?? 0;
  // 1 is also the default of a listing whose rooms Lodgify didn't give: not shown.
  return rooms > 1 ? `${listing.name} - ${rooms} chambres` : listing.name;
}

/** The formula alone, for a short mention ("7 chambres"); null when unknown. */
export function formulaRooms(listing: { name: string; bedrooms?: number | null }): string | null {
  const m = listing.name.match(/\b(\d+)\s*(chambres?|ch\.|bedrooms?|rooms?)\b/i);
  const n = m ? Number(m[1]) : listing.bedrooms ?? 0;
  return n > 1 ? `${n} chambres` : null;
}
