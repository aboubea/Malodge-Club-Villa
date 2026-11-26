/**
 * Names of a house and of its Lodgify formulas (the same as the backend's
 * common/villa-name.ts): the house's main listing is often itself one formula
 * ("La Villa 58 - 5 chambres"); its room count must not label the house, nor a stay
 * booked on another formula.
 */
const SEPARATOR = /\s+[-–—|·•]\s+|\s*,\s+/;
const ROOMS = /^\(?\s*\d+\s*(chambres?|ch\.?|bedrooms?|br|rooms?|pi[eè]ces?)\s*\)?$/i;
const ROOMS_INSIDE = /\b\d+\s*(chambres?|ch\.|bedrooms?|rooms?)\b/i;

export function withoutRooms(name: string): string {
  const kept = name
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p && !ROOMS.test(p))
    .map((p) => p.replace(/\s*\(\s*\d+\s*(chambres?|ch\.?|bedrooms?|rooms?)\s*\)\s*$/i, '').trim())
    .filter(Boolean);
  return kept.join(' - ') || name.trim();
}

/** A house's name: without a formula's room count when the house has formulas. */
export const houseLabel = (name: string, hasFormulas: boolean) => (hasFormulas ? withoutRooms(name) : name);

/** The listing a stay was booked on, with its own room count when the house has formulas. */
export function listingLabel(listing: { name: string; bedrooms?: number | null }, inFormulaGroup: boolean): string {
  if (!inFormulaGroup || ROOMS_INSIDE.test(listing.name)) return listing.name;
  const rooms = listing.bedrooms ?? 0;
  return rooms > 1 ? `${listing.name} - ${rooms} chambres` : listing.name;
}
