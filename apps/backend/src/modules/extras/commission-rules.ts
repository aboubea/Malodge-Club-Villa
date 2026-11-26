/**
 * Commission rules on the extras (pure computation).
 *
 * Each owner and employee has a default rate (their record). A rule overrides it for a villa,
 * a category, a service and/or a person, possibly during a period, and says what the share is
 * computed on: the margin, the Malodge share (employees), the price billed, or a fixed amount
 * per unit. When several rules match an extra, the most specific wins:
 * service (8) > category (4) > villa (2) > person (1); then the one starting latest, then the
 * one changed last. Without a matching rule, the person's default rate applies.
 */

export type RuleBase = 'MARGIN' | 'MALODGE_SHARE' | 'PRICE' | 'FIXED';
export type Beneficiary = 'OWNER' | 'EMPLOYEE';

export interface CommissionRuleIn {
  id: string;
  beneficiary: Beneficiary;
  personId: string | null;
  villaId: string | null;
  categoryId: string | null;
  serviceId: string | null;
  base: RuleBase;
  rate: number | null;
  amount: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  updatedAt?: Date | null;
}

/** What a line keeps of the rule that applied to it. */
export interface RuleTerms {
  id: string;
  base: RuleBase;
  rate: number | null;
  amount: number | null;
}

export interface RuleContext {
  /** The owner of the villa, or the seller. */
  personId: string | null;
  /** The villa of the extra and its house (a Lodgify formula belongs to its house). */
  villaIds: string[];
  categoryId: string | null;
  serviceId: string | null;
  /** Day of the service (a rule with dates needs one). */
  date: Date | null;
}

const DAY = 86_400_000;
const dayNo = (d: Date) => Math.floor(d.getTime() / DAY);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const specificity = (r: Pick<CommissionRuleIn, 'serviceId' | 'categoryId' | 'villaId' | 'personId'>) =>
  (r.serviceId ? 8 : 0) + (r.categoryId ? 4 : 0) + (r.villaId ? 2 : 0) + (r.personId ? 1 : 0);

/** The rule's period holds the day (whole days, both ends included). */
export function inPeriod(r: Pick<CommissionRuleIn, 'validFrom' | 'validTo'>, date: Date | null): boolean {
  if (!r.validFrom && !r.validTo) return true;
  if (!date) return false;
  const d = dayNo(date);
  return (!r.validFrom || d >= dayNo(r.validFrom)) && (!r.validTo || d <= dayNo(r.validTo));
}

export function matches(r: CommissionRuleIn, beneficiary: Beneficiary, ctx: RuleContext): boolean {
  return (
    r.beneficiary === beneficiary &&
    (!r.personId || r.personId === ctx.personId) &&
    (!r.villaId || ctx.villaIds.includes(r.villaId)) &&
    (!r.categoryId || r.categoryId === ctx.categoryId) &&
    (!r.serviceId || r.serviceId === ctx.serviceId) &&
    inPeriod(r, ctx.date)
  );
}

/** The rule that applies to an extra for the owner or the employee, null when none does. */
export function pickRule(rules: CommissionRuleIn[], beneficiary: Beneficiary, ctx: RuleContext): RuleTerms | null {
  let best: CommissionRuleIn | null = null;
  for (const r of rules) {
    if (!matches(r, beneficiary, ctx)) continue;
    if (!best) {
      best = r;
      continue;
    }
    const a = specificity(r) - specificity(best);
    const b = (r.validFrom?.getTime() ?? -Infinity) - (best.validFrom?.getTime() ?? -Infinity);
    const c = (r.updatedAt?.getTime() ?? 0) - (best.updatedAt?.getTime() ?? 0);
    if (a > 0 || (a === 0 && (b > 0 || (b === 0 && c > 0)))) best = r;
  }
  return best ? { id: best.id, base: best.base, rate: best.rate, amount: best.amount } : null;
}

/**
 * The share a rule gives on one extra line, null when what it is computed on is not known
 * (no cost, so no margin; no price…). Never an assumed value.
 */
export function shareOf(
  terms: RuleTerms,
  on: { total: number | null; margin: number | null; malodgeShare: number | null; quantity: number | null },
): number | null {
  const pct = (v: number | null) => (v == null || terms.rate == null ? null : round2(v * terms.rate));
  switch (terms.base) {
    case 'MARGIN':
      return pct(on.margin);
    case 'MALODGE_SHARE':
      return pct(on.malodgeShare);
    case 'PRICE':
      return pct(on.total);
    case 'FIXED':
      return on.quantity == null || terms.amount == null ? null : round2(on.quantity * terms.amount);
  }
}

/** "30 % de la marge", "10 % du prix", "50 MAD par unité". */
export function describeTerms(t: Pick<RuleTerms, 'base' | 'rate' | 'amount'>, currency = 'MAD'): string {
  const p = t.rate == null ? '—' : `${Math.round(t.rate * 1000) / 10} %`;
  switch (t.base) {
    case 'MARGIN':
      return `${p} de la marge`;
    case 'MALODGE_SHARE':
      return `${p} de la part Malodge`;
    case 'PRICE':
      return `${p} du prix`;
    case 'FIXED':
      return `${t.amount ?? '—'} ${currency} par unité`;
  }
}
