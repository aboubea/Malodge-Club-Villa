import { stayNights, stayShare } from '../finance/performance';

/**
 * Monthly statement of an owner (pure computation).
 *
 *  - Accommodation: each stay counts for its nights in the month (as revenue is
 *    dated on the day of the service), in its own currency and in dirhams.
 *  - Management fee: the house's rate on that accommodation revenue.
 *  - Extras: the owner's share of the extras realised in the month (same formulas as
 *    the extras tracking). Every extra of his villas is listed; one not realised yet,
 *    or whose share cannot be computed (owner's rate or cost missing), is not added,
 *    and says why.
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
  extras: {
    date: Date;
    label: string;
    stay: string | null;
    villa: string | null;
    /** Status of the extra: only realised ones (COMPLETED, IN_PROGRESS) count. */
    status?: string;
    /** Price billed to the guest (null when unknown). */
    price?: number | null;
    ownerShare: number | null;
    /** Why the share is unknown (as in the extras tracking: "Taux propriétaire manquant"…). */
    issue?: string | null;
    currency: string;
  }[];
  payments: { date: Date; kind: 'OWNER_PAYOUT' | 'OWNER_REFUND'; amount: number; currency: string; reference: string | null }[];
  /** Amount in dirhams, null when the rate is unknown. */
  toMad: (amount: number, currency: string) => number | null;
  fx: { eurToMad: number | null; date: string | null };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const DONE = ['COMPLETED', 'IN_PROGRESS'];
const NOT_DONE: Record<string, string> = { PENDING: 'À confirmer, pas réalisé', CONFIRMED: 'Confirmé, pas encore réalisé' };
const NOT_DONE_REASONS = Object.values(NOT_DONE).concat('Pas encore réalisé');
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
      // A stay arriving and leaving the same day (day use) has no night but its amount counts.
      .filter((s) => (s.nightsInMonth > 0 || (s.nights === 0 && s.amountInMonth > 0)) && !s.duplicate)
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
    .map((e) => {
      const done = !e.status || DONE.includes(e.status);
      const counted = done && e.ownerShare != null;
      const reason = !done ? NOT_DONE[e.status!] ?? 'Pas encore réalisé' : e.ownerShare == null ? e.issue || 'Part à calculer' : null;
      return {
        date: day(e.date),
        label: e.label,
        stay: e.stay,
        villa: e.villa,
        /** Realised (Réalisée / En cours). */
        done,
        price: e.price ?? null,
        priceMad: done && e.price != null ? mad(e.price, e.currency) : null,
        ownerShare: counted ? e.ownerShare : null,
        currency: e.currency,
        ownerShareMad: counted ? mad(e.ownerShare!, e.currency) : null,
        /** Not added to the total: `reason` says why. */
        incomplete: !counted,
        reason,
      };
    });
  // What is missing, grouped by cause, with what it concerns.
  const byReason = new Map<string, { count: number; sold: number }>();
  for (const e of extras.filter((x) => x.reason)) {
    // "À confirmer" and "Confirmé" both mean not realised yet: one line.
    const key = NOT_DONE_REASONS.includes(e.reason!) ? NOT_DONE_REASONS[0] : e.reason!;
    const g = byReason.get(key) ?? { count: 0, sold: 0 };
    g.count += 1;
    g.sold += e.price != null ? (mad(e.price, e.currency) ?? 0) : 0;
    byReason.set(key, g);
  }
  for (const [reason, g] of byReason) {
    const what = `${g.count} extra${g.count > 1 ? 's' : ''}${g.sold ? ` (${Math.round(g.sold).toLocaleString('fr-FR')} MAD vendus)` : ''}`;
    warnings.push(
      reason === 'Taux propriétaire manquant'
        ? `Taux de commission du propriétaire manquant : la part de ${what} n’est pas comptée (à renseigner dans Extras › Réglages).`
        : reason === 'Coût à renseigner'
          ? `Coût prestataire manquant sur ${what} : marge et part non comptées.`
          : NOT_DONE_REASONS.includes(reason)
            ? `${what} du mois pas encore passé${g.count > 1 ? 's' : ''} en « Réalisée » : non compté${g.count > 1 ? 's' : ''}.`
            : `${reason} : ${what} non compté${g.count > 1 ? 's' : ''}.`,
    );
  }

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
    totals: {
      nights: houses.reduce((t, h) => t + h.nights, 0),
      gross,
      fee,
      net,
      extras: extrasShare,
      /** Extras realised in his villas in the month: how many, and what they were sold. */
      extrasCount: extras.filter((e) => e.done).length,
      extrasSold: sum(extras.map((e) => e.priceMad)),
      /** Extras of the month not added to his share (see their `reason`). */
      extrasNotCounted: extras.filter((e) => e.incomplete).length,
      due,
      paid: paidTotal,
      remaining: r2(due - paidTotal),
    },
    warnings: [...new Set(warnings)],
    generatedAt: new Date().toISOString(),
  };
}

export type StatementData = ReturnType<typeof buildStatement>;
