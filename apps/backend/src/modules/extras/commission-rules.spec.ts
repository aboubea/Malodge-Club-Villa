import { describe, expect, it } from 'vitest';
import { CommissionRuleIn, describeTerms, pickRule, RuleContext, shareOf } from './commission-rules';
import { computeExtra, ExtraInput } from './extras.calc';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
let n = 0;
const rule = (over: Partial<CommissionRuleIn>): CommissionRuleIn => ({
  id: `r${++n}`,
  beneficiary: 'OWNER',
  personId: null,
  villaId: null,
  categoryId: null,
  serviceId: null,
  base: 'MARGIN',
  rate: 0.5,
  amount: null,
  validFrom: null,
  validTo: null,
  ...over,
});
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({ personId: 'paul', villaIds: ['v58-3ch', 'v58'], categoryId: 'activites', serviceId: 'quad', date: d('2026-08-10'), ...over });

describe('which rule applies', () => {
  it('takes the most specific rule: service, then category, then villa, then person', () => {
    const rules = [
      rule({ id: 'all-owners', rate: 0.5 }),
      rule({ id: 'paul', personId: 'paul', rate: 0.4 }),
      rule({ id: 'villa58', villaId: 'v58', rate: 0.3 }),
      rule({ id: 'activities', categoryId: 'activites', rate: 0.2 }),
      rule({ id: 'quad', serviceId: 'quad', rate: 0.1 }),
    ];
    expect(pickRule(rules, 'OWNER', ctx())?.id).toBe('quad');
    expect(pickRule(rules, 'OWNER', ctx({ serviceId: 'chef' }))?.id).toBe('activities');
    expect(pickRule(rules, 'OWNER', ctx({ serviceId: 'chef', categoryId: 'repas' }))?.id).toBe('villa58');
    expect(pickRule(rules, 'OWNER', ctx({ serviceId: 'chef', categoryId: 'repas', villaIds: ['riad'] }))?.id).toBe('paul');
    expect(pickRule(rules, 'OWNER', ctx({ serviceId: 'chef', categoryId: 'repas', villaIds: ['riad'], personId: 'ayet' }))?.id).toBe('all-owners');
    expect(pickRule(rules, 'EMPLOYEE', ctx())).toBeNull();
  });

  it('applies a rule set on a house to its Lodgify formulas', () => {
    expect(pickRule([rule({ id: 'house', villaId: 'v58' })], 'OWNER', ctx({ villaIds: ['v58-3ch', 'v58'] }))?.id).toBe('house');
  });

  it('respects the period, both days included, and needs a date for a dated rule', () => {
    const summer = rule({ id: 'summer', validFrom: d('2026-07-01'), validTo: d('2026-08-31'), rate: 0.6 });
    expect(pickRule([summer], 'OWNER', ctx({ date: d('2026-08-31') }))?.id).toBe('summer');
    expect(pickRule([summer], 'OWNER', ctx({ date: d('2026-09-01') }))).toBeNull();
    expect(pickRule([summer], 'OWNER', ctx({ date: null }))).toBeNull();
    // Same specificity: the rule that started last wins.
    const base = rule({ id: 'always', rate: 0.5 });
    expect(pickRule([base, summer], 'OWNER', ctx())?.id).toBe('summer');
  });
});

describe('what a rule gives', () => {
  const on = { total: 1_000, margin: 400, malodgeShare: 300, quantity: 2 };
  it('computes on the margin, the Malodge share, the price, or a fixed amount per unit', () => {
    expect(shareOf({ id: 'a', base: 'MARGIN', rate: 0.25, amount: null }, on)).toBe(100);
    expect(shareOf({ id: 'a', base: 'MALODGE_SHARE', rate: 0.1, amount: null }, on)).toBe(30);
    expect(shareOf({ id: 'a', base: 'PRICE', rate: 0.05, amount: null }, on)).toBe(50);
    expect(shareOf({ id: 'a', base: 'FIXED', rate: null, amount: 75 }, on)).toBe(150);
    expect(shareOf({ id: 'a', base: 'MARGIN', rate: 0.25, amount: null }, { ...on, margin: null })).toBeNull();
  });

  it('says it in words', () => {
    expect(describeTerms({ base: 'MARGIN', rate: 0.3, amount: null })).toBe('30 % de la marge');
    expect(describeTerms({ base: 'PRICE', rate: 0.125, amount: null })).toBe('12.5 % du prix');
    expect(describeTerms({ base: 'FIXED', rate: null, amount: 50 }, 'MAD')).toBe('50 MAD par unité');
  });
});

describe('extras computed with rules', () => {
  const extra = (over: Partial<ExtraInput> = {}): ExtraInput => ({
    id: 'e1',
    date: d('2026-08-10'),
    status: 'COMPLETED',
    notes: null,
    quantity: 2,
    unitPrice: 500,
    unitCost: 300,
    label: 'Quad',
    serviceId: 'quad',
    stay: { id: 's', label: 'Famille', archived: false, clientId: 'c', checkIn: d('2026-08-08'), checkOut: d('2026-08-15') },
    villa: { id: 'v58', name: 'Villa 58', country: 'Maroc', currency: 'MAD' },
    provider: { id: 'p', name: 'Quad Atlas' },
    owner: { id: 'paul', name: 'Paul', rate: 0.5 },
    seller: { id: 'sara', name: 'Sara', rate: 0.1, base: 'MALODGE_MARGIN' },
    ...over,
  });

  it('without a rule: the default rates, unchanged', () => {
    expect(computeExtra(extra())).toMatchObject({ margin: 400, ownerShare: 200, malodgeShare: 200, sellerShare: 20, net: 180, ownerRule: null, sellerRule: null });
  });

  it('an owner rule on the price, and the employee on what Malodge keeps after it', () => {
    const l = computeExtra(extra({ owner: { id: 'paul', name: 'Paul', rate: 0.5, rule: { id: 'r', base: 'PRICE', rate: 0.1, amount: null } } }));
    expect(l).toMatchObject({ ownerShare: 100, malodgeShare: 300, sellerShare: 30, net: 270, ownerRate: 0.1, ownerRule: { id: 'r' } });
  });

  it('a fixed amount for the employee, and a rule replaces a missing default rate', () => {
    const l = computeExtra(
      extra({
        owner: { id: 'ayet', name: 'Ayet', rate: null, rule: { id: 'r1', base: 'MARGIN', rate: 0.3, amount: null } },
        seller: { id: 'sara', name: 'Sara', rate: null, base: null, rule: { id: 'r2', base: 'FIXED', rate: null, amount: 25 } },
      }),
    );
    expect(l).toMatchObject({ ownerShare: 120, malodgeShare: 280, sellerShare: 50, net: 230, issue: null });
  });

  it('an owner share on the price is known even when the cost is not', () => {
    const l = computeExtra(extra({ unitCost: null, owner: { id: 'paul', name: 'Paul', rate: 0.5, rule: { id: 'r', base: 'PRICE', rate: 0.1, amount: null } } }));
    expect(l).toMatchObject({ ownerShare: 100, margin: null, net: null, issue: 'Coût à renseigner' });
  });
});
