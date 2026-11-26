/**
 * Import of the "Suivi extras Malodge Maroc" spreadsheet.
 *
 * Shared by the admin upload endpoint (POST /extras/import) and the CLI script
 * (prisma/import-extras.ts). Everything runs in one database transaction:
 * a dry run executes the exact same work and rolls it back, so the preview
 * matches what the real import will do; a real import is all-or-nothing.
 * People, villas and catalogue items are matched by name and reused; stays,
 * extras and settlements are created. A second import is refused unless forced.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const CURRENCY = 'MAD';
export const IMPORT_KEY = 'extras.spreadsheetImport';
const MARKUP_KEY = 'extras.catalogMarkup';

type Role = 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE';
type Tx = Prisma.TransactionClient;

export interface ImportReport {
  dryRun: boolean;
  file: string | null;
  read: { people: number; villas: number; catalogue: number; extras: number; settlements: number };
  people: Record<Role, { created: number; reused: number }>;
  villas: { created: string[]; updated: string[] };
  catalogue: { created: number; updated: number; categoriesCreated: string[] };
  stays: { created: number; fromExtras: string[]; datesEstimated: string[]; skipped: string[] };
  adjusted: string[];
  extras: number;
  settlements: { validated: number; pending: number; cancelled: number };
  warnings: string[];
  durationMs: number;
}

export class ImportAlreadyDoneError extends Error {
  constructor(public readonly previous: unknown) {
    super('Le fichier a déjà été importé.');
  }
}

class Rollback extends Error {}

/* ───────────────────────────── Cell helpers ──────────────────────────── */

type Cell = ExcelJS.CellValue;
const val = (c: Cell): unknown => {
  if (c && typeof c === 'object' && !(c instanceof Date)) {
    if ('result' in c) return (c as ExcelJS.CellFormulaValue).result ?? null;
    if ('richText' in c) return (c as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
    if ('text' in c) return (c as ExcelJS.CellHyperlinkValue).text;
    if ('error' in c) return null;
  }
  return c;
};
const str = (c: Cell) => {
  const v = val(c);
  return v === null || v === undefined ? '' : String(v).trim();
};
const num = (c: Cell): number | null => {
  const v = val(c);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').replace(/\s/g, ''));
    if (v.trim() && Number.isFinite(n)) return n;
  }
  return null;
};
const date = (c: Cell): Date | null => {
  const v = val(c);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
  return null;
};
const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const slugify = (s: string) => key(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

/* ──────────────────────────────── Parsing ────────────────────────────── */

const STATUS: Record<string, 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'> = {
  'À confirmer': 'PENDING', Confirmée: 'CONFIRMED', Réalisée: 'COMPLETED', Annulée: 'CANCELLED',
};
const METHOD: Record<string, 'CASH' | 'TRANSFER' | 'CARD' | 'MANUAL'> = { Espèces: 'CASH', Virement: 'TRANSFER', Carte: 'CARD', Autre: 'MANUAL' };
const ROLE: Record<string, Role> = { Client: 'CLIENT', Prestataire: 'PROVIDER', Propriétaire: 'OWNER', Salarié: 'EMPLOYEE' };
const KIND: Record<string, string> = {
  'Reçu client': 'CLIENT_PAYMENT', 'Remboursé au client': 'CLIENT_REFUND',
  'Payé au prestataire': 'PROVIDER_PAYMENT', 'Reçu du prestataire': 'PROVIDER_REFUND',
  'Versé au propriétaire': 'OWNER_PAYOUT', 'Reçu du propriétaire': 'OWNER_REFUND',
  'Versé au salarié': 'EMPLOYEE_PAYOUT', 'Reçu du salarié': 'EMPLOYEE_REFUND',
};

export async function parseWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    throw new Error('Fichier illisible : un classeur Excel (.xlsx) est attendu.');
  }
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Onglet « ${name} » introuvable : ce n'est pas le fichier de suivi des extras attendu.`);
    return ws;
  };
  const rows = (name: string, from: number, to: number) => {
    const ws = sheet(name);
    const out: ExcelJS.Row[] = [];
    for (let r = from; r <= Math.min(to, ws.rowCount); r++) out.push(ws.getRow(r));
    return out;
  };

  const people = rows('Réglages', 6, 304)
    .map((row) => ({
      type: str(row.getCell(1).value),
      name: str(row.getCell(2).value),
      rate: num(row.getCell(3).value),
      base: str(row.getCell(4).value),
      contact: str(row.getCell(5).value),
      villa: str(row.getCell(6).value),
      arrival: date(row.getCell(7).value),
      departure: date(row.getCell(8).value),
      archived: str(row.getCell(9).value) === 'Archivé',
      notes: str(row.getCell(10).value),
    }))
    .filter((p) => p.type && p.name);

  const villas = rows('Réglages', 6, 29)
    .map((r) => ({ name: str(r.getCell(12).value), owner: str(r.getCell(13).value) }))
    .filter((v) => v.name);

  const catalogue = rows('Catalogue extras', 6, 307)
    .map((r) => ({
      name: str(r.getCell(1).value),
      category: str(r.getCell(2).value) || 'Divers',
      unit: str(r.getCell(3).value),
      unitCost: num(r.getCell(4).value),
      publicPrice: num(r.getCell(5).value),
      proposed: num(r.getCell(6).value),
      provider: str(r.getCell(7).value),
    }))
    .filter((c) => c.name);

  const extras = rows('Extras', 6, 305)
    .map((r) => ({
      row: r.number,
      date: date(r.getCell(1).value),
      stay: str(r.getCell(2).value),
      villa: str(r.getCell(3).value),
      label: str(r.getCell(4).value),
      provider: str(r.getCell(5).value),
      qty: num(r.getCell(6).value),
      price: num(r.getCell(7).value),
      cost: num(r.getCell(8).value),
      seller: str(r.getCell(9).value),
      // Cached results: "Total client" and "Coût total" may have been typed over in the spreadsheet.
      totalCell: num(r.getCell(10).value),
      costTotalCell: num(r.getCell(22).value),
      status: STATUS[str(r.getCell(12).value)] ?? ('PENDING' as const),
      note: str(r.getCell(14).value),
    }))
    .filter((e) => e.label || e.stay);

  const settlements = rows('Saisie règlements', 6, 504)
    .map((r) => ({
      row: r.number,
      person: str(r.getCell(1).value),
      date: date(r.getCell(2).value),
      amount: num(r.getCell(3).value),
      validation: str(r.getCell(4).value),
      type: str(r.getCell(5).value),
      method: METHOD[str(r.getCell(8).value)] ?? null,
      reference: str(r.getCell(9).value),
      note: str(r.getCell(10).value),
    }))
    .filter((s) => s.person && s.amount);

  return { people, villas, catalogue, extras, settlements };
}

/* ──────────────────────────────── Import ─────────────────────────────── */

/** Ids are generated here so related rows can be written in batches without round trips. */
const newId = () => `c${Date.now().toString(36)}${randomBytes(9).toString('hex')}`;

/**
 * Resolves everything in memory against preloaded data, then writes in a handful
 * of batched statements (≈20 queries in total, whatever the file size), so the
 * import fits comfortably in a serverless function even with a distant database.
 */
async function runImport(tx: Tx, data: Awaited<ReturnType<typeof parseWorkbook>>, report: ImportReport, force: boolean) {
  const previous = await tx.appSetting.findUnique({ where: { key: IMPORT_KEY } });
  if (previous && !force) throw new ImportAlreadyDoneError(previous.value);

  const warn = (m: string) => report.warnings.push(m);
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);

  const [users, providers, villaRows, categories, services] = await Promise.all([
    tx.user.findMany({ where: { role: { in: ['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE'] } }, select: { id: true, firstName: true, lastName: true, role: true } }),
    tx.provider.findMany({ select: { id: true, userId: true } }),
    tx.villa.findMany({ select: { id: true, name: true, slug: true } }),
    tx.serviceCategory.findMany({ select: { id: true, name: true, slug: true } }),
    tx.service.findMany({ select: { id: true, name: true, slug: true } }),
  ]);

  const userIds = new Map<string, string>(users.map((u) => [`${u.role}|${key(`${u.firstName} ${u.lastName}`)}`, u.id]));
  const providerByUser = new Map(providers.map((p) => [p.userId, p.id]));
  const villaIds = new Map(villaRows.map((v) => [key(v.name), v.id]));
  const villaSlugs = new Set(villaRows.map((v) => v.slug));
  const categoryIds = new Map(categories.map((c) => [key(c.name), c.id]));
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const serviceIds = new Map(services.map((s) => [key(s.name), s.id]));
  const serviceSlugs = new Set(services.map((s) => s.slug));
  const uniqueSlug = (base: string, taken: Set<string>) => {
    let slug = slugify(base);
    while (taken.has(slug)) slug = `${slugify(base)}-${randomBytes(2).toString('hex')}`;
    taken.add(slug);
    return slug;
  };

  // Pending writes
  const newUsers = new Map<string, Prisma.UserCreateManyInput>();
  const userUpdates = new Map<string, Prisma.UserUpdateInput>();
  const newProviders: Prisma.ProviderCreateManyInput[] = [];
  const newVillas: Prisma.VillaCreateManyInput[] = [];
  const villaUpdates = new Map<string, Prisma.VillaUncheckedUpdateInput>();
  const newCategories: Prisma.ServiceCategoryCreateManyInput[] = [];
  const newServices: Prisma.ServiceCreateManyInput[] = [];
  const serviceUpdates = new Map<string, Prisma.ServiceUncheckedUpdateInput>();
  const newStays: Prisma.ReservationCreateManyInput[] = [];
  const newOrders: Prisma.OrderCreateManyInput[] = [];
  const newItems: Prisma.OrderItemCreateManyInput[] = [];
  const newSettlements: Prisma.SettlementCreateManyInput[] = [];
  const counted = new Set<string>();

  function person(role: Role, name: string, fields: Record<string, unknown> = {}) {
    const k = `${role}|${key(name)}`;
    let id = userIds.get(k);
    if (!id) {
      id = newId();
      const [firstName, ...rest] = name.split(/\s+/);
      newUsers.set(id, {
        id,
        email: `${slugify(name)}-${randomBytes(4).toString('hex')}@fiche.malodge.invalid`,
        password: passwordHash,
        firstName,
        lastName: rest.join(' '),
        role,
        canLogin: false,
      });
      userIds.set(k, id);
      report.people[role].created++;
      counted.add(k);
    } else if (!counted.has(k)) {
      report.people[role].reused++;
      counted.add(k);
    }
    if (Object.keys(fields).length) {
      const pending = newUsers.get(id);
      if (pending) Object.assign(pending, fields);
      else userUpdates.set(id, { ...(userUpdates.get(id) ?? {}), ...fields });
    }
    if (role === 'PROVIDER' && !providerByUser.has(id)) {
      const providerId = newId();
      providerByUser.set(id, providerId);
      newProviders.push({ id: providerId, userId: id });
    }
    return id;
  }

  // People (owners, employees, providers) with their rates
  for (const p of data.people.filter((x) => x.type !== 'Client')) {
    const role = ROLE[p.type];
    if (!role) {
      warn(`Type de personne inconnu « ${p.type} » pour ${p.name} : ligne ignorée.`);
      continue;
    }
    person(role, p.name, {
      ...(p.contact ? { phone: p.contact } : {}),
      ...(p.notes ? { notes: p.notes } : {}),
      ...(role === 'OWNER' || role === 'EMPLOYEE' ? { commissionRate: p.rate } : {}),
      ...(role === 'EMPLOYEE' ? { commissionBase: p.base === 'Marge totale' ? 'TOTAL_MARGIN' : 'MALODGE_MARGIN' } : {}),
    });
    if ((role === 'OWNER' || role === 'EMPLOYEE') && p.rate == null) warn(`${p.name} : taux de commission à renseigner.`);
  }

  // Villas: matched by name, set to MAD with their owner
  const villaNames = new Map<string, string>();
  for (const n of [...data.villas.map((v) => v.name), ...data.people.map((p) => p.villa), ...data.extras.map((e) => e.villa)]) {
    if (n && !villaNames.has(key(n))) villaNames.set(key(n), n);
  }
  for (const [k, name] of villaNames) {
    const ownerName = data.villas.find((v) => key(v.name) === k)?.owner;
    const ownerId = ownerName ? person('OWNER', ownerName) : null;
    const existing = villaIds.get(k);
    if (existing) {
      villaUpdates.set(existing, { currency: CURRENCY, ...(ownerId ? { ownerId } : {}) });
      report.villas.updated.push(name);
    } else {
      const id = newId();
      newVillas.push({ id, name, slug: uniqueSlug(name, villaSlugs), address: 'À compléter', city: 'Marrakech', country: 'Maroc', currency: CURRENCY, ownerId, isActive: true });
      villaIds.set(k, id);
      report.villas.created.push(name);
    }
  }
  if (report.villas.created.length) warn(`Villas créées avec une adresse à compléter : ${report.villas.created.join(', ')}.`);

  // Catalogue
  for (const c of data.catalogue) {
    let categoryId = categoryIds.get(key(c.category));
    if (!categoryId) {
      categoryId = newId();
      newCategories.push({ id: categoryId, name: c.category, slug: uniqueSlug(c.category, categorySlugs) });
      categoryIds.set(key(c.category), categoryId);
      report.catalogue.categoriesCreated.push(c.category);
    }
    const providerUser = c.provider ? person('PROVIDER', c.provider) : null;
    const fields = {
      categoryId,
      unit: c.unit || null,
      unitCost: c.unitCost,
      publicPrice: c.publicPrice,
      basePrice: c.proposed ?? c.publicPrice ?? (c.unitCost != null ? Math.round(c.unitCost * 1.25) : 0),
      currency: CURRENCY,
      defaultProviderId: providerUser ? providerByUser.get(providerUser)! : null,
    };
    const existing = serviceIds.get(key(c.name));
    if (existing) {
      serviceUpdates.set(existing, fields);
      report.catalogue.updated++;
    } else {
      const id = newId();
      newServices.push({ ...fields, id, name: c.name, slug: uniqueSlug(c.name, serviceSlugs), isActive: true });
      serviceIds.set(key(c.name), id);
      report.catalogue.created++;
    }
  }

  // Stays (clients)
  const stays = new Map<string, { id: string; clientId: string; villaId: string }>();
  function stay(label: string, villaName: string, info?: (typeof data.people)[number]) {
    const k = key(label);
    if (stays.has(k)) return stays.get(k)!;
    const villaId = villaIds.get(key(villaName));
    if (!villaId) return null;
    // Dates are never invented: they come from the settings, otherwise from the stay's
    // own extras (then payments) and are flagged "to confirm"; with nothing, no stay.
    const known = info?.arrival && info?.departure;
    const own = data.extras.filter((e) => key(e.stay) === k && e.date).map((e) => e.date!.getTime());
    const paid = data.settlements.filter((st) => key(st.person) === k && st.date).map((st) => st.date!.getTime());
    const hints = own.length ? own : paid;
    if (!known && !info?.arrival && !info?.departure && hints.length === 0) {
      report.stays.skipped.push(label);
      warn(`Séjour « ${label} » non importé : ni dates ni extras dans l'Excel.`);
      return null;
    }
    const checkIn = info?.arrival ?? new Date(Math.min(...(hints.length ? hints : [info!.departure!.getTime()])));
    const checkOut = info?.departure ?? new Date(Math.max(...(hints.length ? hints : [checkIn.getTime()])));
    const clientId = person('CLIENT', label, info?.contact ? { phone: info.contact } : {});
    if (!known) {
      report.stays.datesEstimated.push(label);
      warn(`Séjour « ${label} » : dates absentes de l'Excel, déduites ${own.length ? 'des extras' : 'des règlements'} (${checkIn.toISOString().slice(0, 10)} → ${checkOut.toISOString().slice(0, 10)}) — à confirmer.`);
    }
    const id = newId();
    newStays.push({
      id, label, villaId, clientId, checkIn, checkOut, datesEstimated: !known, totalAmount: 0, status: 'CONFIRMED',
      archived: info?.archived ?? false, source: 'extras-import', notes: info?.notes || null,
    });
    const entry = { id, clientId, villaId };
    stays.set(k, entry);
    report.stays.created++;
    return entry;
  }
  for (const p of data.people.filter((x) => x.type === 'Client')) {
    if (!p.villa) {
      warn(`Séjour « ${p.name} » sans villa : créé seulement s'il a des extras.`);
      continue;
    }
    stay(p.name, p.villa, p);
  }

  // Extras
  for (const e of data.extras) {
    let s = stays.get(key(e.stay)) ?? null;
    if (!s && e.stay && e.villa) {
      s = stay(e.stay, e.villa);
      if (s) {
        report.stays.fromExtras.push(e.stay);
        warn(`Séjour « ${e.stay} » absent des réglages : créé depuis l'extra ligne ${e.row}, à vérifier.`);
      }
    }
    if (!s) {
      warn(`Extra ligne ${e.row} ignoré : séjour « ${e.stay || '—'} » introuvable.`);
      continue;
    }
    const serviceId = serviceIds.get(key(e.label)) ?? null;
    const providerUser = e.provider ? person('PROVIDER', e.provider) : null;
    const sellerId = e.seller ? person('EMPLOYEE', e.seller) : null;
    // Quantity, sale and cost prices. When the spreadsheet's total was typed over
    // (≠ quantity × price), the typed total wins: quantity or unit price is adjusted.
    let qty = e.qty;
    let price = e.price;
    let cost = e.cost;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const what = `Extra ligne ${e.row} (${e.stay} — ${e.label})`;
    if (e.status !== 'CANCELLED' && e.totalCell != null && e.totalCell > 0) {
      const computed = qty != null && price != null ? qty * price : null;
      if (computed === null || Math.abs(computed - e.totalCell) > 0.005) {
        const q0 = qty;
        const p0 = price;
        const ratio = price ? e.totalCell / price : NaN;
        if (price && Math.abs(ratio - Math.round(ratio)) < 1e-6 && Math.round(ratio) > 0) qty = Math.round(ratio);
        else if (qty && qty > 0) price = r2(e.totalCell / qty);
        else {
          qty = 1;
          price = e.totalCell;
        }
        const msg = `${what} : total saisi dans l'Excel ${e.totalCell} ≠ ${q0 ?? '—'} × ${p0 ?? '—'} ; repris en ${qty} × ${price}.`;
        report.adjusted.push(msg);
        warn(msg);
      }
    }
    if (e.status !== 'CANCELLED' && e.costTotalCell != null && e.costTotalCell > 0 && qty) {
      const origQty = e.qty ?? qty;
      const computed = cost != null ? origQty * cost : null;
      if (computed === null || Math.abs(computed - e.costTotalCell) > 0.005) {
        const c0 = cost;
        cost = r2(e.costTotalCell / qty);
        const msg = `${what} : coût total saisi dans l'Excel ${e.costTotalCell} ≠ ${origQty} × ${c0 ?? '—'} ; coût unitaire repris à ${cost}.`;
        report.adjusted.push(msg);
        warn(msg);
      }
    }
    const total = qty != null && price != null ? r2(qty * price) : 0;
    const orderId = newId();
    newOrders.push({
      id: orderId,
      clientId: s.clientId,
      reservationId: s.id,
      villaId: (e.villa && villaIds.get(key(e.villa))) || s.villaId,
      providerId: providerUser ? providerByUser.get(providerUser)! : null,
      sellerId,
      status: e.status,
      scheduledAt: e.date,
      notes: e.note || null,
      totalAmount: total,
    });
    newItems.push({ id: newId(), orderId, serviceId, label: serviceId ? null : e.label || 'À compléter', quantity: qty ?? 0, unitPrice: price, unitCost: cost, total });
    report.extras++;
  }

  // Settlements — as in the spreadsheet, only validated rows with a date count.
  for (const st of data.settlements) {
    const kind = KIND[st.type] ?? (stays.has(key(st.person)) ? 'CLIENT_PAYMENT' : null);
    if (!kind) {
      warn(`Règlement ligne ${st.row} ignoré : type « ${st.type} » inconnu.`);
      continue;
    }
    let personId: string;
    let reservationId: string | null = null;
    if (kind.startsWith('CLIENT')) {
      const s = stays.get(key(st.person));
      if (!s) {
        warn(`Règlement ligne ${st.row} ignoré : séjour « ${st.person} » introuvable.`);
        continue;
      }
      personId = s.clientId;
      reservationId = s.id;
    } else {
      personId = person(kind.startsWith('PROVIDER') ? 'PROVIDER' : kind.startsWith('OWNER') ? 'OWNER' : 'EMPLOYEE', st.person);
    }
    const status = st.validation === 'Annulé' ? 'CANCELLED' : st.validation === 'Validé' && st.date ? 'VALIDATED' : 'PENDING';
    if (st.validation === 'Validé' && !st.date) warn(`Règlement de ${st.person} (${st.amount} ${CURRENCY}) sans date : importé « à valider ».`);
    const note = [st.note, st.validation === 'Validé' && !st.date ? "Importé « à valider » : date manquante dans l'Excel." : null].filter(Boolean).join(' ');
    newSettlements.push({
      id: newId(), kind: kind as any, status, personId, reservationId, date: st.date, amount: st.amount!, currency: CURRENCY,
      method: st.method, reference: st.reference || null, note: note || null, validatedAt: status === 'VALIDATED' ? new Date() : null,
    });
    report.settlements[status === 'VALIDATED' ? 'validated' : status === 'PENDING' ? 'pending' : 'cancelled']++;
  }

  /* ── Batched writes, in foreign-key order ── */
  if (newUsers.size) await tx.user.createMany({ data: [...newUsers.values()] });
  for (const [id, fields] of userUpdates) await tx.user.update({ where: { id }, data: fields });
  if (newProviders.length) await tx.provider.createMany({ data: newProviders });
  if (newVillas.length) await tx.villa.createMany({ data: newVillas });
  for (const [id, fields] of villaUpdates) await tx.villa.update({ where: { id }, data: fields });
  if (newCategories.length) await tx.serviceCategory.createMany({ data: newCategories });
  if (newServices.length) await tx.service.createMany({ data: newServices });
  for (const [id, fields] of serviceUpdates) await tx.service.update({ where: { id }, data: fields });
  if (newStays.length) await tx.reservation.createMany({ data: newStays });
  if (newOrders.length) await tx.order.createMany({ data: newOrders });
  if (newItems.length) await tx.orderItem.createMany({ data: newItems });
  if (newSettlements.length) await tx.settlement.createMany({ data: newSettlements });

  await tx.appSetting.upsert({ where: { key: MARKUP_KEY }, update: {}, create: { key: MARKUP_KEY, value: 0.25 } });
  const stamp = {
    file: report.file,
    at: new Date().toISOString(),
    extras: report.extras,
    settlements: newSettlements.length,
    // Exact list of what this import created, used to undo it.
    created: {
      users: [...newUsers.keys()],
      providers: newProviders.map((x) => x.id),
      villas: newVillas.map((x) => x.id),
      categories: newCategories.map((x) => x.id),
      services: newServices.map((x) => x.id),
      reservations: newStays.map((x) => x.id),
      orders: newOrders.map((x) => x.id),
      settlements: newSettlements.map((x) => x.id),
    },
  };
  await tx.appSetting.upsert({ where: { key: IMPORT_KEY }, update: { value: stamp }, create: { key: IMPORT_KEY, value: stamp } });
}

export async function importExtrasWorkbook(
  prisma: PrismaClient,
  buffer: Buffer,
  opts: { dryRun?: boolean; force?: boolean; fileName?: string } = {},
): Promise<ImportReport> {
  const started = Date.now();
  const data = await parseWorkbook(buffer);
  const emptyPeople = () => ({ created: 0, reused: 0 });
  const report: ImportReport = {
    dryRun: !!opts.dryRun,
    file: opts.fileName ?? null,
    read: { people: data.people.length, villas: data.villas.length, catalogue: data.catalogue.length, extras: data.extras.length, settlements: data.settlements.length },
    people: { CLIENT: emptyPeople(), PROVIDER: emptyPeople(), OWNER: emptyPeople(), EMPLOYEE: emptyPeople() },
    villas: { created: [], updated: [] },
    catalogue: { created: 0, updated: 0, categoriesCreated: [] },
    stays: { created: 0, fromExtras: [], datesEstimated: [], skipped: [] },
    adjusted: [],
    extras: 0,
    settlements: { validated: 0, pending: 0, cancelled: 0 },
    warnings: [],
    durationMs: 0,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        await runImport(tx, data, report, !!opts.force);
        if (opts.dryRun) throw new Rollback();
      },
      { maxWait: 10_000, timeout: 25_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  report.durationMs = Date.now() - started;
  return report;
}

/* ─────────────────────────────── Undo ─────────────────────────────── */

export interface UndoReport {
  dryRun: boolean;
  file: string | null;
  importedAt: string | null;
  mode: 'exact' | 'markers';
  toDelete: { stays: number; extras: number; settlements: number; people: number; villas: number; services: number; categories: number };
  /** Imported records edited since the import: those edits would be lost. */
  modifiedSince: { extras: number; settlements: number; stays: number };
  /** Records created after the import that rely on imported data: undo is refused. */
  blockers: string[];
}

type Created = { users: string[]; providers: string[]; villas: string[]; categories: string[]; services: string[]; reservations: string[]; orders: string[]; settlements: string[] };

async function findCreated(prisma: PrismaClient | Tx, stamp: { at?: string; created?: Created }): Promise<{ created: Created; mode: 'exact' | 'markers' }> {
  if (stamp.created) return { created: stamp.created, mode: 'exact' };
  // Imports made before ids were recorded: rely on markers, within the import's time window.
  const end = stamp.at ? new Date(new Date(stamp.at).getTime() + 5_000) : new Date();
  const start = new Date(end.getTime() - 65_000);
  const inWindow = { gte: start, lte: end };
  const reservations = (await prisma.reservation.findMany({ where: { source: 'extras-import', createdAt: inWindow }, select: { id: true } })).map((r) => r.id);
  const users = (await prisma.user.findMany({ where: { email: { endsWith: '@fiche.malodge.invalid' }, createdAt: inWindow }, select: { id: true } })).map((u) => u.id);
  const orders = (await prisma.order.findMany({ where: { reservationId: { in: reservations }, createdAt: inWindow }, select: { id: true } })).map((o) => o.id);
  const settlements = (
    await prisma.settlement.findMany({
      where: { createdAt: inWindow, OR: [{ reservationId: { in: reservations } }, { personId: { in: users } }] },
      select: { id: true },
    })
  ).map((s) => s.id);
  const providers = (await prisma.provider.findMany({ where: { userId: { in: users }, createdAt: inWindow }, select: { id: true } })).map((p) => p.id);
  const villas = (await prisma.villa.findMany({ where: { createdAt: inWindow, address: 'À compléter' }, select: { id: true } })).map((v) => v.id);
  const services = (await prisma.service.findMany({ where: { createdAt: inWindow, currency: CURRENCY }, select: { id: true } })).map((s) => s.id);
  const categories = (await prisma.serviceCategory.findMany({ where: { createdAt: inWindow }, select: { id: true } })).map((c) => c.id);
  return { created: { users, providers, villas, categories, services, reservations, orders, settlements }, mode: 'markers' };
}

export async function undoImport(prisma: PrismaClient, opts: { dryRun: boolean }): Promise<UndoReport> {
  const row = await prisma.appSetting.findUnique({ where: { key: IMPORT_KEY } });
  if (!row) throw new Error('Aucun import à annuler.');
  const stamp = (row.value ?? {}) as { at?: string; file?: string; created?: Created };
  const { created: c, mode } = await findCreated(prisma, stamp);
  const after = stamp.at ? new Date(new Date(stamp.at).getTime() + 5_000) : new Date(0);

  const notIn = (ids: string[]) => ({ notIn: ids.length ? ids : ['__none__'] });
  const anyIn = (ids: string[]) => ({ in: ids.length ? ids : ['__none__'] });
  const [ordersDep, itemsDep, settlementsDep, staysDep, servicesDep, villaServicesDep, eventsDep, conversationsDep] = await Promise.all([
    prisma.order.count({ where: { id: notIn(c.orders), OR: [{ reservationId: anyIn(c.reservations) }, { clientId: anyIn(c.users) }, { providerId: anyIn(c.providers) }, { sellerId: anyIn(c.users) }, { villaId: anyIn(c.villas) }] } }),
    prisma.orderItem.count({ where: { orderId: notIn(c.orders), serviceId: anyIn(c.services) } }),
    prisma.settlement.count({ where: { id: notIn(c.settlements), OR: [{ personId: anyIn(c.users) }, { reservationId: anyIn(c.reservations) }] } }),
    prisma.reservation.count({ where: { id: notIn(c.reservations), OR: [{ villaId: anyIn(c.villas) }, { clientId: anyIn(c.users) }] } }),
    prisma.service.count({ where: { id: notIn(c.services), categoryId: anyIn(c.categories) } }),
    prisma.villaService.count({ where: { OR: [{ villaId: anyIn(c.villas) }, { serviceId: anyIn(c.services) }] } }),
    prisma.calendarEvent.count({ where: { OR: [{ orderId: anyIn(c.orders) }, { reservationId: anyIn(c.reservations) }, { villaId: anyIn(c.villas) }] } }),
    prisma.conversation.count({ where: { reservationId: anyIn(c.reservations) } }),
  ]);
  const blockers = [
    ordersDep && `${ordersDep} extra(s) saisi(s) depuis l'import sur des séjours, personnes ou villas importés`,
    itemsDep && `${itemsDep} commande(s) utilisant des prestations importées`,
    settlementsDep && `${settlementsDep} règlement(s) saisi(s) depuis l'import pour des personnes ou séjours importés`,
    staysDep && `${staysDep} réservation(s) créée(s) depuis l'import sur des villas ou clients importés`,
    servicesDep && `${servicesDep} prestation(s) ajoutée(s) depuis dans des catégories importées`,
    villaServicesDep && `${villaServicesDep} service(s) de villa lié(s) aux villas ou prestations importées`,
    eventsDep && `${eventsDep} événement(s) d'agenda lié(s) aux données importées`,
    conversationsDep && `${conversationsDep} conversation(s) liée(s) aux séjours importés`,
  ].filter(Boolean) as string[];

  const [extrasModified, settlementsModified, staysModified] = await Promise.all([
    prisma.order.count({ where: { id: anyIn(c.orders), updatedAt: { gt: after } } }),
    prisma.settlement.count({ where: { id: anyIn(c.settlements), updatedAt: { gt: after } } }),
    prisma.reservation.count({ where: { id: anyIn(c.reservations), updatedAt: { gt: after } } }),
  ]);

  const report: UndoReport = {
    dryRun: opts.dryRun,
    file: stamp.file ?? null,
    importedAt: stamp.at ?? null,
    mode,
    toDelete: {
      stays: c.reservations.length, extras: c.orders.length, settlements: c.settlements.length, people: c.users.length,
      villas: c.villas.length, services: c.services.length, categories: c.categories.length,
    },
    modifiedSince: { extras: extrasModified, settlements: settlementsModified, stays: staysModified },
    blockers,
  };
  if (opts.dryRun || blockers.length) return report;

  await prisma.$transaction(
    async (tx) => {
      await tx.settlement.deleteMany({ where: { id: anyIn(c.settlements) } });
      await tx.orderItem.deleteMany({ where: { orderId: anyIn(c.orders) } });
      await tx.order.deleteMany({ where: { id: anyIn(c.orders) } });
      await tx.reservation.deleteMany({ where: { id: anyIn(c.reservations) } });
      await tx.serviceProvider.deleteMany({ where: { OR: [{ serviceId: anyIn(c.services) }, { providerId: anyIn(c.providers) }] } });
      await tx.service.deleteMany({ where: { id: anyIn(c.services) } });
      await tx.serviceCategory.deleteMany({ where: { id: anyIn(c.categories) } });
      await tx.service.updateMany({ where: { defaultProviderId: anyIn(c.providers) }, data: { defaultProviderId: null } });
      await tx.providerCategory.deleteMany({ where: { providerId: anyIn(c.providers) } });
      await tx.provider.deleteMany({ where: { id: anyIn(c.providers) } });
      await tx.villa.updateMany({ where: { ownerId: anyIn(c.users) }, data: { ownerId: null } });
      await tx.villa.deleteMany({ where: { id: anyIn(c.villas) } });
      await tx.user.deleteMany({ where: { id: anyIn(c.users) } });
      await tx.appSetting.delete({ where: { key: IMPORT_KEY } });
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
  return report;
}
