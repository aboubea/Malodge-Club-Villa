import { stayNights, stayShare } from '../finance/performance';

/**
 * Monthly statement of an owner (pure computation).
 *
 *  - Accommodation: each stay counts for its nights in the month (as revenue is
 *    dated on the day of the service), in its own currency and in dirhams.
 *  - Management fee: the house's rate on that accommodation revenue.
 *  - Extras: the owner's share of the extras done in the month (same formulas as
 *    the extras tracking); a line whose share is not known is listed, not added.
 *  - Payments: what was paid to the owner (validated) in the month.
 * Everything is totalled in dirhams at the rate recorded in the statement.
 */

export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)), label: `${MONTHS_FR[m - 1]} ${y}` };
}

/** "YYYY-MM" of the month before `date`. */
export function previousMonth(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface StatementInput {
  owner: { id: string; name: string; email: string | null };
  month: string;
  houses: { id: string; name: string; feeRate: number }[];
  stays: { id: string; house: string; villa: string; guest: string; checkIn: Date | null; checkOut: Date | null; totalAmount: number; currency: string }[];
  extras: { date: Date; label: string; stay: string | null; villa: string | null; ownerShare: number | null; currency: string }[];
  payments: { date: Date; kind: 'OWNER_PAYOUT' | 'OWNER_REFUND'; amount: number; currency: string; reference: string | null }[];
  /** Amount in dirhams, null when the rate is unknown. */
  toMad: (amount: number, currency: string) => number | null;
  fx: { eurToMad: number | null; date: string | null };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function buildStatement(input: StatementInput) {
  const range = monthRange(input.month);
  const warnings: string[] = [];
  const mad = (amount: number, currency: string) => {
    const v = input.toMad(amount, currency);
    if (v == null) warnings.push(`Montant en ${currency} non converti (taux indisponible) : non compté dans les totaux.`);
    return v == null ? null : r2(v);
  };

  const houses = input.houses.map((h) => {
    const own = input.stays.filter((s) => s.house === h.id);
    // Nights already covered by a stay with an amount: a stay without amount on them is the same stay keyed twice.
    const paid = new Set(own.filter((s) => s.totalAmount > 0).flatMap((s) => stayNights(s, range)));
    const stays = own
      .map((s) => {
        const nightsInMonth = stayNights(s, range).length;
        const share = stayShare({ id: s.id, checkIn: s.checkIn, checkOut: s.checkOut, amount: s.totalAmount }, range);
        return {
          id: s.id,
          guest: s.guest,
          villa: s.villa,
          checkIn: day(s.checkIn),
          checkOut: day(s.checkOut),
          nights: s.checkIn && s.checkOut ? Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / 86_400_000) : 0,
          nightsInMonth,
          amount: s.totalAmount,
          amountInMonth: r2(share),
          currency: s.currency,
          amountInMonthMad: s.totalAmount > 0 ? mad(share, s.currency) : 0,
          amountMissing: !(s.totalAmount > 0),
          duplicate: !(s.totalAmount > 0) && stayNights(s, range).every((d) => paid.has(d)),
        };
      })
      .filter((s) => s.nightsInMonth > 0 && !s.duplicate)
      .sort((a, b) => (a.checkIn ?? '').localeCompare(b.checkIn ?? ''));
    const gross = r2(stays.reduce((t, s) => t + (s.amountInMonthMad ?? 0), 0));
    const fee = r2(gross * h.feeRate);
    const missing = stays.filter((s) => s.amountMissing).length;
    if (missing) warnings.push(`${h.name} : ${missing} séjour(s) sans montant (non comptés dans le CA).`);
    return { id: h.id, name: h.name, feeRate: h.feeRate, stays, nights: stays.reduce((t, s) => t + s.nightsInMonth, 0), gross, fee, net: r2(gross - fee) };
  });

  const extras = input.extras
    .filter((e) => e.date >= range.start && e.date <= range.end)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => ({
      date: day(e.date),
      label: e.label,
      stay: e.stay,
      villa: e.villa,
      ownerShare: e.ownerShare,
      currency: e.currency,
      ownerShareMad: e.ownerShare == null ? null : mad(e.ownerShare, e.currency),
      incomplete: e.ownerShare == null,
    }));
  const incomplete = extras.filter((e) => e.incomplete).length;
  if (incomplete) warnings.push(`${incomplete} extra(s) à compléter : leur part n’est pas comptée.`);

  const payments = input.payments
    .filter((p) => p.date >= range.start && p.date <= range.end)
    .map((p) => {
      const sign = p.kind === 'OWNER_PAYOUT' ? 1 : -1;
      return { date: day(p.date), kind: p.kind, amount: p.amount, currency: p.currency, amountMad: (() => { const v = mad(p.amount, p.currency); return v == null ? null : v * sign; })(), reference: p.reference };
    });

  const sum = (xs: (number | null)[]) => r2(xs.reduce<number>((t, x) => t + (x ?? 0), 0));
  const gross = sum(houses.map((h) => h.gross));
  const fee = sum(houses.map((h) => h.fee));
  const net = r2(gross - fee);
  const extrasShare = sum(extras.map((e) => e.ownerShareMad));
  const due = r2(net + extrasShare);
  const paidTotal = sum(payments.map((p) => p.amountMad));

  return {
    version: 1,
    owner: input.owner,
    month: input.month,
    monthLabel: range.label,
    period: { start: day(range.start), end: day(range.end) },
    currency: 'MAD',
    fx: input.fx,
    houses,
    extras,
    payments,
    totals: { nights: houses.reduce((t, h) => t + h.nights, 0), gross, fee, net, extras: extrasShare, due, paid: paidTotal, remaining: r2(due - paidTotal) },
    warnings: [...new Set(warnings)],
    generatedAt: new Date().toISOString(),
  };
}

export type StatementData = ReturnType<typeof buildStatement>;
