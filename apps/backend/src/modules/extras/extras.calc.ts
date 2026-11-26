/**
 * Extras tracking — pure computation engine.
 *
 * Mirrors the "Suivi extras Malodge Maroc" spreadsheet:
 *   total client   = qty × sale price
 *   cost           = qty × purchase cost
 *   margin         = total − cost
 *   owner share    = margin × owner rate                    (villa owner; 0 when the villa has no owner)
 *   Malodge share  = margin − owner share
 *   employee share = base × employee rate                   (seller; base = Malodge share or total margin)
 *   net Malodge    = margin − owner share − employee share
 * Rates are read live from people records, so changing a rate recomputes the whole history.
 * Cancelled extras count for nothing. Missing data never gets replaced by an assumed value:
 * the line is flagged and its unknown parts are left out of the totals.
 */

export type AccountRole = 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE';

export type CommissionBase = 'MALODGE_MARGIN' | 'TOTAL_MARGIN';

export interface ExtraInput {
  id: string;
  date: Date | null;
  status: string; // OrderStatus
  notes: string | null;
  quantity: number | null;
  unitPrice: number | null;
  unitCost: number | null;
  label: string;
  serviceId: string | null;
  stay: { id: string; label: string; archived: boolean; clientId: string } | null;
  villa: { id: string; name: string; country: string; currency: string } | null;
  provider: { id: string; name: string } | null;
  owner: { id: string; name: string; rate: number | null } | null;
  seller: { id: string; name: string; rate: number | null; base: CommissionBase | null } | null;
}

export interface ExtraLine extends Omit<ExtraInput, 'owner' | 'seller'> {
  currency: string;
  owner: { id: string; name: string } | null;
  seller: { id: string; name: string } | null;
  cancelled: boolean;
  total: number | null;
  cost: number | null;
  margin: number | null;
  ownerRate: number | null;
  ownerShare: number | null;
  malodgeShare: number | null;
  sellerRate: number | null;
  sellerBase: CommissionBase | null;
  sellerShare: number | null;
  net: number | null;
  /** First blocking issue, as in the spreadsheet's "À compléter" column. */
  issue: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function computeExtra(input: ExtraInput): ExtraLine {
  const cancelled = input.status === 'CANCELLED';
  const currency = input.villa?.currency ?? 'EUR';
  const base: Omit<ExtraLine, 'total' | 'cost' | 'margin' | 'ownerRate' | 'ownerShare' | 'malodgeShare' | 'sellerRate' | 'sellerBase' | 'sellerShare' | 'net' | 'issue'> = {
    ...input,
    currency,
    owner: input.owner ? { id: input.owner.id, name: input.owner.name } : null,
    seller: input.seller ? { id: input.seller.id, name: input.seller.name } : null,
    cancelled,
  };

  if (cancelled) {
    return {
      ...base,
      total: 0, cost: 0, margin: 0,
      ownerRate: input.owner ? input.owner.rate : 0, ownerShare: 0, malodgeShare: 0,
      sellerRate: input.seller ? input.seller.rate : 0, sellerBase: input.seller?.base ?? null, sellerShare: 0,
      net: 0, issue: null,
    };
  }

  const qtyOk = isNum(input.quantity) && input.quantity > 0;
  const total = qtyOk && isNum(input.unitPrice) ? round2(input.quantity! * input.unitPrice) : null;
  const cost = qtyOk && isNum(input.unitCost) ? round2(input.quantity! * input.unitCost) : null;
  const margin = total !== null && cost !== null ? round2(total - cost) : null;

  // Owner: no owner → 0 %; owner without a rate → unknown.
  const ownerRate = input.owner ? (isNum(input.owner.rate) ? input.owner.rate : null) : 0;
  const ownerShare = margin !== null && ownerRate !== null ? round2(margin * ownerRate) : null;
  const malodgeShare = margin !== null && ownerShare !== null ? round2(margin - ownerShare) : null;

  // Employee: no seller → 0 %; seller without a rate → unknown. Default base = Malodge share.
  const sellerRate = input.seller ? (isNum(input.seller.rate) ? input.seller.rate : null) : 0;
  const sellerBase: CommissionBase | null = input.seller ? input.seller.base ?? 'MALODGE_MARGIN' : null;
  const baseAmount = sellerBase === 'TOTAL_MARGIN' ? margin : malodgeShare;
  const sellerShare = !input.seller
    ? 0
    : baseAmount !== null && sellerRate !== null
      ? round2(baseAmount * sellerRate)
      : null;

  const net =
    margin !== null && ownerShare !== null && sellerShare !== null
      ? round2(margin - ownerShare - sellerShare)
      : null;

  let issue: string | null = null;
  if (!input.date) issue = 'Date à renseigner';
  else if (!input.stay) issue = 'Séjour à créer';
  else if (!input.villa) issue = 'Villa à vérifier';
  else if (!qtyOk) issue = 'Quantité à renseigner';
  else if (!isNum(input.unitPrice)) issue = 'Prix à renseigner';
  else if (!isNum(input.unitCost)) issue = 'Coût à renseigner';
  else if (input.unitCost > 0 && !input.provider) issue = 'Prestataire à vérifier';
  else if (ownerRate === null) issue = 'Taux propriétaire manquant';
  else if (sellerRate === null) issue = 'Taux salarié manquant';
  else if (
    sellerShare !== null && malodgeShare !== null && margin !== null && margin >= 0 && sellerShare > malodgeShare
  ) issue = 'Commission > part Malodge';

  return { ...base, total, cost, margin, ownerRate, ownerShare, malodgeShare, sellerRate, sellerBase, sellerShare, net, issue };
}

/* ───────────────────────────── Settlements ───────────────────────────── */

export type SettlementKind =
  | 'CLIENT_PAYMENT' | 'CLIENT_REFUND'
  | 'PROVIDER_PAYMENT' | 'PROVIDER_REFUND'
  | 'OWNER_PAYOUT' | 'OWNER_REFUND'
  | 'EMPLOYEE_PAYOUT' | 'EMPLOYEE_REFUND';

/** role: whose account; balance: effect on what is owed; treasury: cash in (+) / out (−) for Malodge. */
export const SETTLEMENT_KINDS: Record<SettlementKind, { role: AccountRole; balance: 1 | -1; treasury: 1 | -1; label: string }> = {
  CLIENT_PAYMENT: { role: 'CLIENT', balance: 1, treasury: 1, label: 'Reçu client' },
  CLIENT_REFUND: { role: 'CLIENT', balance: -1, treasury: -1, label: 'Remboursé au client' },
  PROVIDER_PAYMENT: { role: 'PROVIDER', balance: 1, treasury: -1, label: 'Payé au prestataire' },
  PROVIDER_REFUND: { role: 'PROVIDER', balance: -1, treasury: 1, label: 'Reçu du prestataire' },
  OWNER_PAYOUT: { role: 'OWNER', balance: 1, treasury: -1, label: 'Versé au propriétaire' },
  OWNER_REFUND: { role: 'OWNER', balance: -1, treasury: 1, label: 'Reçu du propriétaire' },
  EMPLOYEE_PAYOUT: { role: 'EMPLOYEE', balance: 1, treasury: -1, label: 'Versé au salarié' },
  EMPLOYEE_REFUND: { role: 'EMPLOYEE', balance: -1, treasury: 1, label: 'Reçu du salarié' },
};

export interface SettlementInput {
  kind: SettlementKind;
  status: 'PENDING' | 'VALIDATED' | 'CANCELLED';
  amount: number;
  currency: string;
  /** Account key: reservation id for clients, user id (or provider id) for the other roles. */
  accountId: string;
}

/* ─────────────────────────────── Accounts ─────────────────────────────── */

export type AccountState = 'Réglé' | 'Partiel' | 'Non réglé' | 'Avance' | 'Rien à régler' | 'À compléter';

export interface Account {
  role: AccountRole;
  id: string;
  name: string;
  currency: string;
  /** Amount generated by the extras (billed to the client, owed to the others). */
  due: number;
  /** Net amount settled (validated settlements only). */
  paid: number;
  balance: number;
  state: AccountState;
  extrasCount: number;
  incompleteCount: number;
  archived?: boolean;
  meta?: Record<string, unknown>;
}

export function accountState(due: number, paid: number, incomplete: number): AccountState {
  const balance = due - paid;
  if (Math.abs(due) < 0.005 && Math.abs(paid) < 0.005) return incomplete > 0 ? 'À compléter' : 'Rien à régler';
  if (balance < -0.005) return 'Avance';
  if (Math.abs(balance) < 0.005) return 'Réglé';
  return paid > 0 ? 'Partiel' : 'Non réglé';
}

interface AccountSeed {
  role: AccountRole;
  id: string;
  name: string;
  currency: string;
  archived?: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Builds the four account books from extras lines and settlements.
 * `seeds` lists accounts that must appear even without activity (e.g. a new owner).
 */
export function buildAccounts(lines: ExtraLine[], settlements: SettlementInput[], seeds: AccountSeed[] = []): Account[] {
  const map = new Map<string, Account>();
  const key = (role: AccountRole, id: string, currency: string) => `${role}|${id}|${currency}`;
  const ensure = (s: AccountSeed) => {
    const k = key(s.role, s.id, s.currency);
    let acc = map.get(k);
    if (!acc) {
      acc = { role: s.role, id: s.id, name: s.name, currency: s.currency, due: 0, paid: 0, balance: 0, state: 'Rien à régler', extrasCount: 0, incompleteCount: 0, archived: s.archived, meta: s.meta };
      map.set(k, acc);
    }
    return acc;
  };

  for (const s of seeds) ensure(s);

  for (const l of lines) {
    if (l.cancelled) continue;
    const touch = (role: AccountRole, id: string, name: string, amount: number | null, archived?: boolean) => {
      const acc = ensure({ role, id, name, currency: l.currency, archived });
      acc.extrasCount += 1;
      if (amount !== null) acc.due += amount;
      if (l.issue) acc.incompleteCount += 1;
    };
    if (l.stay) touch('CLIENT', l.stay.id, l.stay.label, l.total, l.stay.archived);
    if (l.provider) touch('PROVIDER', l.provider.id, l.provider.name, l.cost);
    if (l.owner) touch('OWNER', l.owner.id, l.owner.name, l.ownerShare);
    if (l.seller) touch('EMPLOYEE', l.seller.id, l.seller.name, l.sellerShare);
  }

  for (const s of settlements) {
    if (s.status !== 'VALIDATED') continue;
    const def = SETTLEMENT_KINDS[s.kind];
    const acc = [...map.values()].find((a) => a.role === def.role && a.id === s.accountId && a.currency === s.currency)
      ?? ensure({ role: def.role, id: s.accountId, name: '—', currency: s.currency });
    acc.paid += s.amount * def.balance;
  }

  for (const acc of map.values()) {
    acc.due = round2(acc.due);
    acc.paid = round2(acc.paid);
    acc.balance = round2(acc.due - acc.paid);
    acc.state = accountState(acc.due, acc.paid, acc.incompleteCount);
  }
  return [...map.values()];
}

/* ──────────────────────────────── Totals ──────────────────────────────── */

export interface Totals {
  currency: string;
  count: number;
  incomplete: number;
  billed: number;
  cost: number;
  margin: number;
  ownerShare: number;
  sellerShare: number;
  net: number;
}

export function totalsByCurrency(lines: ExtraLine[]): Totals[] {
  const map = new Map<string, Totals>();
  for (const l of lines) {
    let t = map.get(l.currency);
    if (!t) {
      t = { currency: l.currency, count: 0, incomplete: 0, billed: 0, cost: 0, margin: 0, ownerShare: 0, sellerShare: 0, net: 0 };
      map.set(l.currency, t);
    }
    t.count += 1;
    if (l.cancelled) continue;
    if (l.issue) t.incomplete += 1;
    t.billed += l.total ?? 0;
    t.cost += l.cost ?? 0;
    t.margin += l.margin ?? 0;
    t.ownerShare += l.ownerShare ?? 0;
    t.sellerShare += l.sellerShare ?? 0;
    t.net += l.net ?? 0;
  }
  return [...map.values()].map((t) => ({
    ...t,
    billed: round2(t.billed), cost: round2(t.cost), margin: round2(t.margin),
    ownerShare: round2(t.ownerShare), sellerShare: round2(t.sellerShare), net: round2(t.net),
  }));
}

/** Catalogue rule: the public price wins; otherwise purchase cost + markup, rounded to the unit. */
export function proposedPrice(unitCost: number | null, publicPrice: number | null, markup: number): number | null {
  if (isNum(publicPrice)) return publicPrice;
  if (isNum(unitCost)) return Math.round(unitCost * (1 + markup));
  return null;
}
