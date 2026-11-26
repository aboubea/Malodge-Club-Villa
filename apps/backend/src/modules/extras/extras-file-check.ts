/**
 * Compares the extras spreadsheet with the app, line by line: every extra (date,
 * stay, villa, service, provider, quantity, price, cost, status, seller), every
 * payment (person, type, date, amount, state, method), every stay (villa, dates)
 * and the owners' and employees' rates. Read-only: nothing is written.
 *
 * A file line is paired with the app record that resembles it most (stay, service,
 * date, amount…), so that a line whose date or price differs is still found and its
 * differences shown, instead of reported missing.
 */
import { PrismaClient } from '@prisma/client';
import { uniqueVillaMatch } from '@malodge/shared';
import { VILLA_ALIASES_KEY, parseWorkbook } from './extras-import';
import { NAME_ALIASES_KEY, applyNameAliases } from './people-merge';

export type CheckKind = 'extra' | 'settlement' | 'stay' | 'person';
export type CheckState = 'ok' | 'diff' | 'missing' | 'appOnly';

export interface FieldDiff {
  field: string;
  file: string;
  app: string;
}

export interface CheckLine {
  kind: CheckKind;
  state: CheckState;
  /** Where it is in the spreadsheet ("Extras ligne 12"), or "Appli" for a record only in the app. */
  where: string;
  label: string;
  diffs: FieldDiff[];
}

export interface FileCheckReport {
  read: { extras: number; settlements: number; stays: number; people: number; from: string | null; to: string | null };
  summary: Record<CheckKind, Record<CheckState, number>>;
  lines: CheckLine[];
  /** What is incomplete or doubtful in the file itself. */
  fileIssues: string[];
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Same service whatever the spacing or "personnes"/"pers." spelling. */
const labelKey = (s: string) =>
  norm(s).replace(/\bet\b/g, '&').replace(/\bpersonnes?\b/g, 'pers').replace(/\bheures?\b/g, 'h').replace(/\s+/g, '');
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const fr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const money = (n: number | null | undefined) => (n == null ? '—' : `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/ | /g, ' ')} MAD`);
const same = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) < 0.01;
const daysApart = (a: string | null, b: string | null) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 : Infinity);
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() : '');

/** The file often gives a first name only ("Laurence"): it matches "Laurence Martin". */
function samePerson(file: string, app: string) {
  const f = norm(file);
  const a = norm(app);
  if (!f || !a) return false;
  if (f === a) return true;
  const ft = f.split(' ');
  const at = a.split(' ');
  return ft.every((t) => at.includes(t));
}

const ORDER_STATUS: Record<string, string> = { PENDING: 'À confirmer', CONFIRMED: 'Confirmée', IN_PROGRESS: 'En cours', COMPLETED: 'Réalisée', CANCELLED: 'Annulée' };
const SETTLE_STATUS: Record<string, string> = { PENDING: 'À valider', VALIDATED: 'Validé', CANCELLED: 'Annulé' };
const METHOD: Record<string, string> = { CASH: 'Espèces', TRANSFER: 'Virement', CARD: 'Carte', MANUAL: 'Autre' };
const KIND: Record<string, string> = {
  'Reçu client': 'CLIENT_PAYMENT', 'Remboursé au client': 'CLIENT_REFUND',
  'Payé au prestataire': 'PROVIDER_PAYMENT', 'Reçu du prestataire': 'PROVIDER_REFUND',
  'Versé au propriétaire': 'OWNER_PAYOUT', 'Reçu du propriétaire': 'OWNER_REFUND',
  'Versé au salarié': 'EMPLOYEE_PAYOUT', 'Reçu du salarié': 'EMPLOYEE_REFUND',
};
const KIND_LABEL = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k]));

/** Pairs file lines with app records, the most alike first (score ≥ min), each used once. */
function pair<F, A>(file: F[], app: A[], score: (f: F, a: A) => number, min: number) {
  const scored: { f: number; a: number; s: number }[] = [];
  file.forEach((f, i) => app.forEach((a, j) => {
    const s = score(f, a);
    if (s >= min) scored.push({ f: i, a: j, s });
  }));
  scored.sort((x, y) => y.s - x.s);
  const fileTo = new Map<number, number>();
  const usedApp = new Set<number>();
  for (const x of scored) {
    if (fileTo.has(x.f) || usedApp.has(x.a)) continue;
    fileTo.set(x.f, x.a);
    usedApp.add(x.a);
  }
  return { fileTo, usedApp };
}

export async function checkExtrasFile(prisma: PrismaClient, buffer: Buffer): Promise<FileCheckReport> {
  const data = await parseWorkbook(buffer);
  // People merged in the app (typos in the file) are compared under the name kept.
  const nameAliases = ((await prisma.appSetting.findUnique({ where: { key: NAME_ALIASES_KEY } }))?.value ?? {}) as Record<string, string>;
  applyNameAliases(data, nameAliases);
  const alias = (n: string) => (n && nameAliases[norm(n)]) || n;
  data.extras.forEach((e) => {
    e.provider = alias(e.provider);
    e.seller = alias(e.seller);
  });

  const lines: CheckLine[] = [];
  const fileIssues: string[] = [];
  const add = (l: CheckLine) => lines.push(l);

  /* ── Villas: the file's names → the app's houses ── */
  const villas = await prisma.villa.findMany({ select: { id: true, name: true, parentVillaId: true, ownerId: true, owner: { select: { firstName: true, lastName: true } } } });
  const houseOf = (id: string | null | undefined) => (id ? villas.find((v) => v.id === id)?.parentVillaId ?? id : null);
  const villaAliases = ((await prisma.appSetting.findUnique({ where: { key: VILLA_ALIASES_KEY } }))?.value ?? {}) as Record<string, string>;
  const aliasByKey = new Map(Object.entries(villaAliases).map(([n, id]) => [norm(n), id]));
  const houses = villas.filter((v) => !v.parentVillaId);
  const villaOf = (name: string): string | null => {
    if (!name) return null;
    const viaAlias = aliasByKey.get(norm(name));
    if (viaAlias && villas.some((v) => v.id === viaAlias)) return houseOf(viaAlias);
    const exact = villas.find((v) => norm(v.name) === norm(name));
    if (exact) return houseOf(exact.id);
    return houseOf(uniqueVillaMatch(name, houses)?.id ?? null);
  };
  const villaName = (id: string | null) => (id ? villas.find((v) => v.id === id)?.name ?? '—' : '—');

  /* ── Extras ── */
  const orders = await prisma.order.findMany({
    select: {
      id: true, status: true, scheduledAt: true, totalAmount: true, villaId: true,
      reservation: { select: { label: true, villaId: true, client: { select: { firstName: true, lastName: true } } } },
      client: { select: { firstName: true, lastName: true } },
      provider: { select: { user: { select: { firstName: true, lastName: true } } } },
      seller: { select: { firstName: true, lastName: true } },
      items: { select: { label: true, quantity: true, unitPrice: true, unitCost: true, total: true, service: { select: { name: true } } } },
    },
  });
  const app = orders.map((o) => {
    const item = o.items[0];
    const qty = o.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    const costKnown = o.items.every((i) => i.unitCost != null);
    return {
      id: o.id,
      stay: o.reservation?.label || fullName(o.reservation?.client) || fullName(o.client),
      house: houseOf(o.villaId ?? o.reservation?.villaId),
      date: day(o.scheduledAt),
      label: item?.label ?? item?.service?.name ?? '',
      provider: fullName(o.provider?.user),
      seller: fullName(o.seller),
      qty: o.items.length === 1 ? item.quantity : qty,
      total: o.totalAmount ?? o.items.reduce((s, i) => s + (i.total ?? 0), 0),
      cost: costKnown ? o.items.reduce((s, i) => s + (i.unitCost ?? 0) * (i.quantity ?? 0), 0) : null,
      status: o.status as string,
    };
  });
  const file = data.extras.map((e) => {
    const total = e.totalCell ?? (e.qty != null && e.price != null ? e.qty * e.price : null);
    const cost = e.costTotalCell ?? (e.cost != null && e.qty != null ? e.cost * e.qty : null);
    return { ...e, day: day(e.date), house: villaOf(e.villa), total, costTotal: cost };
  });
  const { fileTo, usedApp } = pair(
    file,
    app,
    (f, a) =>
      (samePerson(f.stay, a.stay) ? 5 : 0) +
      (labelKey(f.label) === labelKey(a.label) ? 4 : labelKey(a.label).includes(labelKey(f.label)) || labelKey(f.label).includes(labelKey(a.label)) ? 2 : 0) +
      (f.day && f.day === a.date ? 3 : daysApart(f.day, a.date) <= 3 ? 1 : 0) +
      (same(f.total, a.total) ? 2 : 0) +
      (f.provider && samePerson(f.provider, a.provider) ? 1 : 0),
    7,
  );
  file.forEach((f, i) => {
    const where = `Extras ligne ${f.row}`;
    const label = `${f.stay || '—'} · ${f.label || 'À compléter'}${f.day ? ` · ${fr(f.day)}` : ''}`;
    const j = fileTo.get(i);
    if (j === undefined) {
      add({ kind: 'extra', state: 'missing', where, label, diffs: [] });
      return;
    }
    const a = app[j];
    const diffs: FieldDiff[] = [];
    const d = (field: string, fv: string, av: string) => diffs.push({ field, file: fv, app: av });
    if (f.day !== a.date) d('Date', fr(f.day), fr(a.date));
    if (f.stay && !samePerson(f.stay, a.stay)) d('Client / séjour', f.stay, a.stay || '—');
    if (f.villa && f.house !== a.house) d('Villa', f.villa, villaName(a.house));
    if (f.label && labelKey(f.label) !== labelKey(a.label)) d('Prestation', f.label, a.label || '—');
    if (f.provider ? !samePerson(f.provider, a.provider) : !!a.provider) d('Prestataire', f.provider || '—', a.provider || '—');
    if (f.qty != null && !same(f.qty, a.qty) && !same(f.total, a.total)) d('Quantité', String(f.qty), String(a.qty ?? '—'));
    if (f.total != null && !same(f.total, a.total)) d('Prix client (total)', money(f.total), money(a.total));
    if (f.costTotal != null && !same(f.costTotal, a.cost)) d('Coût prestataire (total)', money(f.costTotal), money(a.cost));
    if (f.status !== a.status) d('Statut', ORDER_STATUS[f.status] ?? f.status, ORDER_STATUS[a.status] ?? a.status);
    if (f.seller ? !samePerson(f.seller, a.seller) : !!a.seller) d('Vendeur / salarié', f.seller || '—', a.seller || '—');
    add({ kind: 'extra', state: diffs.length ? 'diff' : 'ok', where, label, diffs });
  });
  // In the app only: extras of the file's villas within the file's period.
  const fileDays = file.map((f) => f.day).filter(Boolean).sort() as string[];
  const from = fileDays[0] ?? null;
  const to = fileDays[fileDays.length - 1] ?? null;
  const fileHouses = new Set([...file.map((f) => f.house), ...data.villas.map((v) => villaOf(v.name))].filter(Boolean));
  app.forEach((a, j) => {
    if (usedApp.has(j) || !a.house || !fileHouses.has(a.house)) return;
    if (a.date && ((from && a.date < from) || (to && a.date > to))) return;
    add({ kind: 'extra', state: 'appOnly', where: 'Appli', label: `${a.stay || '—'} · ${a.label || '—'}${a.date ? ` · ${fr(a.date)}` : ''} · ${money(a.total)}`, diffs: [] });
  });
  file
    .filter((f) => f.status !== 'CANCELLED')
    .forEach((f) => {
      const lacks = [!f.day && 'date', !f.villa && 'villa', !f.provider && 'prestataire', f.total == null && 'prix', f.costTotal == null && 'coût'].filter(Boolean);
      if (lacks.length) fileIssues.push(`Extras ligne ${f.row} (${f.stay || '—'} · ${f.label || '—'}) : ${lacks.join(', ')} non renseigné${lacks.length > 1 ? 's' : ''} dans le fichier.`);
    });

  /* ── Payments ── */
  const settlements = await prisma.settlement.findMany({
    select: { id: true, kind: true, date: true, amount: true, status: true, method: true, person: { select: { firstName: true, lastName: true } } },
  });
  const appPay = settlements.map((s) => ({ id: s.id, person: fullName(s.person), kind: s.kind as string, date: day(s.date), amount: s.amount, status: s.status as string, method: s.method as string | null }));
  const filePay = data.settlements.map((s) => ({
    ...s,
    kind: KIND[s.type] ?? 'CLIENT_PAYMENT',
    day: day(s.date),
    status: s.validation === 'Annulé' ? 'CANCELLED' : s.validation === 'Validé' && s.date ? 'VALIDATED' : 'PENDING',
  }));
  const paid = pair(
    filePay,
    appPay,
    (f, a) => (samePerson(f.person, a.person) ? 5 : 0) + (f.kind === a.kind ? 2 : 0) + (same(f.amount, a.amount) ? 4 : 0) + (f.day && f.day === a.date ? 3 : daysApart(f.day, a.date) <= 5 ? 1 : 0),
    9,
  );
  filePay.forEach((f, i) => {
    const where = `Saisie règlements ligne ${f.row}`;
    const label = `${f.person} · ${f.type || 'Reçu client'} · ${money(f.amount)}${f.day ? ` · ${fr(f.day)}` : ''}`;
    const j = paid.fileTo.get(i);
    if (j === undefined) {
      add({ kind: 'settlement', state: 'missing', where, label, diffs: [] });
      return;
    }
    const a = appPay[j];
    const diffs: FieldDiff[] = [];
    if (f.kind !== a.kind) diffs.push({ field: 'Type', file: f.type, app: KIND_LABEL[a.kind] ?? a.kind });
    if (!same(f.amount, a.amount)) diffs.push({ field: 'Montant', file: money(f.amount), app: money(a.amount) });
    if (f.day && f.day !== a.date) diffs.push({ field: 'Date', file: fr(f.day), app: fr(a.date) });
    if (f.status !== a.status) diffs.push({ field: 'État', file: f.validation || '—', app: SETTLE_STATUS[a.status] ?? a.status });
    if (f.method && a.method && f.method !== a.method) diffs.push({ field: 'Mode', file: METHOD[f.method], app: METHOD[a.method] ?? a.method });
    add({ kind: 'settlement', state: diffs.length ? 'diff' : 'ok', where, label, diffs });
  });
  const filePeople = new Set(filePay.map((f) => norm(f.person)));
  appPay.forEach((a, j) => {
    if (paid.usedApp.has(j) || ![...filePeople].some((p) => samePerson(p, a.person))) return;
    if (a.date && ((from && a.date < from) || (to && a.date > to))) return;
    add({ kind: 'settlement', state: 'appOnly', where: 'Appli', label: `${a.person} · ${KIND_LABEL[a.kind] ?? a.kind} · ${money(a.amount)}${a.date ? ` · ${fr(a.date)}` : ''}`, diffs: [] });
  });
  filePay.forEach((f) => {
    if (f.validation === 'Validé' && !f.day) fileIssues.push(`Saisie règlements ligne ${f.row} (${f.person}, ${money(f.amount)}) : « Validé » sans date dans le fichier.`);
  });
  const seen = new Map<string, number>();
  filePay.forEach((f) => {
    const k = `${norm(f.person)}|${f.kind}|${f.amount}`;
    const before = seen.get(k);
    if (before !== undefined) fileIssues.push(`Saisie règlements lignes ${before} et ${f.row} : même paiement de ${f.person} (${money(f.amount)}) saisi deux fois ?`);
    else seen.set(k, f.row);
  });

  /* ── Stays (clients of the file, with their villa and dates) ── */
  const reservations = await prisma.reservation.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { id: true, label: true, villaId: true, checkIn: true, checkOut: true, client: { select: { firstName: true, lastName: true } } },
  });
  const appStays = reservations.map((r) => ({ name: r.label || fullName(r.client), house: houseOf(r.villaId), in: day(r.checkIn), out: day(r.checkOut) }));
  const clients = data.people.filter((p) => p.type === 'Client');
  clients.forEach((p) => {
    const where = 'Réglages';
    const house = villaOf(p.villa);
    const fin = day(p.arrival);
    const fout = day(p.departure);
    const label = `${p.name}${p.villa ? ` · ${p.villa}` : ''}${fin ? ` · ${fr(fin)} → ${fr(fout)}` : ''}`;
    const candidates = appStays
      .filter((s) => samePerson(p.name, s.name))
      .map((s) => ({ s, score: (house && s.house === house ? 4 : 0) + (fin && s.in === fin ? 2 : daysApart(fin, s.in) <= 7 ? 1 : 0) + (fout && s.out === fout ? 2 : 0) }))
      .sort((x, y) => y.score - x.score);
    const best = candidates[0]?.s;
    if (!best) {
      add({ kind: 'stay', state: 'missing', where, label, diffs: [] });
      return;
    }
    const diffs: FieldDiff[] = [];
    if (house && best.house !== house) diffs.push({ field: 'Villa', file: p.villa, app: villaName(best.house) });
    if (fin && best.in !== fin) diffs.push({ field: 'Arrivée', file: fr(fin), app: fr(best.in) });
    if (fout && best.out !== fout) diffs.push({ field: 'Départ', file: fr(fout), app: fr(best.out) });
    add({ kind: 'stay', state: diffs.length ? 'diff' : 'ok', where, label, diffs });
    if (!fin && !fout && !p.archived) fileIssues.push(`Réglages : séjour de ${p.name} sans dates dans le fichier.`);
  });

  /* ── Owners and employees: rate; villas: owner ── */
  const staff = await prisma.user.findMany({
    where: { role: { in: ['OWNER', 'EMPLOYEE', 'PROVIDER'] } },
    select: { firstName: true, lastName: true, role: true, commissionRate: true },
  });
  const ROLE: Record<string, string> = { Propriétaire: 'OWNER', Salarié: 'EMPLOYEE', Prestataire: 'PROVIDER' };
  data.people
    .filter((p) => ROLE[p.type])
    .forEach((p) => {
      const where = 'Réglages';
      const label = `${p.type} · ${p.name}`;
      const u = staff.find((s) => s.role === ROLE[p.type] && samePerson(p.name, fullName(s)));
      if (!u) {
        add({ kind: 'person', state: 'missing', where, label, diffs: [] });
        return;
      }
      const diffs: FieldDiff[] = [];
      const pct = (r: number | null | undefined) => (r == null ? 'non renseigné' : `${Math.round(r * 1000) / 10} %`);
      if (p.type !== 'Prestataire' && p.rate != null && !same(p.rate, u.commissionRate)) diffs.push({ field: 'Taux de commission', file: pct(p.rate), app: pct(u.commissionRate) });
      if (p.type === 'Propriétaire') {
        const owned = data.villas.filter((v) => samePerson(p.name, v.owner || '') || (p.villa && norm(p.villa) === norm(v.name))).map((v) => v.name);
        for (const v of new Set(owned)) {
          const id = villaOf(v);
          const appOwner = id ? fullName(villas.find((x) => x.id === id)?.owner) : '';
          if (id && !samePerson(p.name, appOwner)) diffs.push({ field: `Propriétaire de ${v}`, file: p.name, app: appOwner || 'aucun' });
        }
        if (p.rate == null) fileIssues.push(`Réglages : propriétaire ${p.name} sans taux dans le fichier.`);
      }
      add({ kind: 'person', state: diffs.length ? 'diff' : 'ok', where, label, diffs });
    });

  const summary = (['extra', 'settlement', 'stay', 'person'] as CheckKind[]).reduce(
    (acc, k) => {
      acc[k] = { ok: 0, diff: 0, missing: 0, appOnly: 0 };
      lines.filter((l) => l.kind === k).forEach((l) => acc[k][l.state]++);
      return acc;
    },
    {} as FileCheckReport['summary'],
  );
  return {
    read: { extras: data.extras.length, settlements: data.settlements.length, stays: clients.length, people: data.people.length - clients.length, from, to },
    summary,
    lines,
    fileIssues,
  };
}
