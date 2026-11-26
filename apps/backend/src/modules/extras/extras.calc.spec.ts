import { describe, expect, it } from 'vitest';
import { accountState, buildAccounts, computeExtra, dateWarning, ExtraInput, proposedPrice, totalsByCurrency } from './extras.calc';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** A complete extra: 2 × 500 MAD sold, bought 300 MAD each, owner 50 %, seller 10 %. */
function extra(over: Partial<ExtraInput> = {}): ExtraInput {
  return {
    id: 'e1',
    date: d('2026-08-10'),
    status: 'COMPLETED',
    notes: null,
    quantity: 2,
    unitPrice: 500,
    unitCost: 300,
    label: 'Quad Agafay',
    serviceId: 's1',
    stay: { id: 'st1', label: 'Famille Martin', archived: false, clientId: 'c1', checkIn: d('2026-08-08'), checkOut: d('2026-08-15') },
    villa: { id: 'v1', name: 'Villa 58', country: 'Maroc', currency: 'MAD' },
    provider: { id: 'p1', name: 'Quad Atlas' },
    owner: { id: 'o1', name: 'Propriétaire', rate: 0.5 },
    seller: { id: 'u1', name: 'Salarié', rate: 0.1, base: 'MALODGE_MARGIN' },
    ...over,
  };
}

describe('extra computation (same formulas as the spreadsheet)', () => {
  it('splits the margin between owner, Malodge and seller', () => {
    const l = computeExtra(extra());
    expect(l).toMatchObject({
      currency: 'MAD',
      total: 1_000,
      cost: 600,
      margin: 400,
      ownerShare: 200,
      malodgeShare: 200,
      sellerShare: 20,
      net: 180,
      issue: null,
      warning: null,
    });
  });

  it('computes the seller share on the total margin when asked', () => {
    const l = computeExtra(extra({ seller: { id: 'u1', name: 'Salarié', rate: 0.1, base: 'TOTAL_MARGIN' } }));
    expect(l.sellerShare).toBe(40);
    expect(l.net).toBe(160);
  });

  it('gives no owner share when the villa has no owner', () => {
    const l = computeExtra(extra({ owner: null }));
    expect(l.ownerShare).toBe(0);
    expect(l.malodgeShare).toBe(400);
  });

  it('never invents a missing amount: the line is flagged and its unknown parts stay empty', () => {
    const l = computeExtra(extra({ unitCost: null }));
    expect(l.total).toBe(1_000);
    expect(l.cost).toBeNull();
    expect(l.margin).toBeNull();
    expect(l.net).toBeNull();
    expect(l.issue).toBe('Coût à renseigner');

    expect(computeExtra(extra({ date: null })).issue).toBe('Date à renseigner');
    expect(computeExtra(extra({ owner: { id: 'o1', name: 'P', rate: null } })).issue).toBe('Taux propriétaire manquant');
  });

  it('counts a cancelled extra for nothing', () => {
    const l = computeExtra(extra({ status: 'CANCELLED' }));
    expect(l).toMatchObject({ cancelled: true, total: 0, cost: 0, margin: 0, net: 0, issue: null });
  });

  it('flags a commission larger than the Malodge share', () => {
    expect(computeExtra(extra({ seller: { id: 'u1', name: 'S', rate: 0.8, base: 'TOTAL_MARGIN' } })).issue).toBe('Commission > part Malodge');
  });

  it('warns about an extra dated outside the stay, arrival and departure days included', () => {
    const stay = extra().stay;
    expect(dateWarning(d('2026-08-08'), stay)).toBeNull();
    expect(dateWarning(d('2026-08-15'), stay)).toBeNull();
    expect(dateWarning(d('2026-08-16'), stay)).toBe('Date hors séjour');
    expect(dateWarning(d('2026-08-16'), { ...stay!, checkIn: null, checkOut: null })).toBeNull();
  });
});

describe('accounts', () => {
  it('counts validated settlements only, per currency', () => {
    const lines = [computeExtra(extra()), computeExtra(extra({ id: 'e2', villa: { id: 'v2', name: 'Mas', country: 'France', currency: 'EUR' }, unitPrice: 50, unitCost: 30 }))];
    const accounts = buildAccounts(lines, [
      { kind: 'CLIENT_PAYMENT', status: 'VALIDATED', amount: 600, currency: 'MAD', accountId: 'st1' },
      { kind: 'CLIENT_PAYMENT', status: 'PENDING', amount: 400, currency: 'MAD', accountId: 'st1' },
      { kind: 'PROVIDER_PAYMENT', status: 'VALIDATED', amount: 600, currency: 'MAD', accountId: 'p1' },
    ]);
    const client = (c: string) => accounts.find((a) => a.role === 'CLIENT' && a.currency === c)!;
    expect(client('MAD')).toMatchObject({ due: 1_000, paid: 600, balance: 400, state: 'Partiel' });
    expect(client('EUR')).toMatchObject({ due: 100, paid: 0, state: 'Non réglé' });
    expect(accounts.find((a) => a.role === 'PROVIDER' && a.currency === 'MAD')).toMatchObject({ due: 600, paid: 600, state: 'Réglé' });
  });

  it('names the state of an account', () => {
    expect(accountState(100, 100, 0)).toBe('Réglé');
    expect(accountState(100, 150, 0)).toBe('Avance');
    expect(accountState(100, 0, 0)).toBe('Non réglé');
    expect(accountState(0, 0, 1)).toBe('À compléter');
    expect(accountState(0, 0, 0)).toBe('Rien à régler');
  });

  it('totals per currency, without mixing them', () => {
    const totals = totalsByCurrency([
      computeExtra(extra()),
      computeExtra(extra({ id: 'e2', villa: { id: 'v2', name: 'Mas', country: 'France', currency: 'EUR' }, unitPrice: 50, unitCost: 30 })),
      computeExtra(extra({ id: 'e3', status: 'CANCELLED' })),
    ]);
    expect(totals.find((t) => t.currency === 'MAD')).toMatchObject({ count: 2, billed: 1_000, margin: 400 });
    expect(totals.find((t) => t.currency === 'EUR')).toMatchObject({ count: 1, billed: 100, margin: 40 });
  });
});

describe('catalogue price', () => {
  it('keeps the public price, else cost plus markup', () => {
    expect(proposedPrice(300, 450, 0.25)).toBe(450);
    expect(proposedPrice(300, null, 0.25)).toBe(375);
    expect(proposedPrice(null, null, 0.25)).toBeNull();
  });
});
