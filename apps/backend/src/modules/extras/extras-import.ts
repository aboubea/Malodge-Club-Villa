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
  stays: { created: number; fromExtras: string[] };
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

async function runImport(tx: Tx, data: Awaited<ReturnType<typeof parseWorkbook>>, report: ImportReport, force: boolean) {
  const previous = await tx.appSetting.findUnique({ where: { key: IMPORT_KEY } });
  if (previous && !force) throw new ImportAlreadyDoneError(previous.value);

  const warn = (m: string) => report.warnings.push(m);
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);

  // Preload everything that is matched by name, to keep the number of queries low.
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
  const touched = new Set<string>();
  const uniqueSlug = (base: string, taken: Set<string>) => {
    let slug = slugify(base);
    while (taken.has(slug)) slug = `${slugify(base)}-${randomBytes(2).toString('hex')}`;
    taken.add(slug);
    return slug;
  };

  async function person(role: Role, name: string, data: Record<string, unknown> = {}) {
    const k = `${role}|${key(name)}`;
    let id = userIds.get(k);
    if (id) {
      if (Object.keys(data).length) await tx.user.update({ where: { id }, data });
      if (!touched.has(k)) report.people[role].reused++;
    } else {
      const [firstName, ...rest] = name.split(/\s+/);
      id = (
        await tx.user.create({
          data: {
            email: `${slugify(name)}-${randomBytes(4).toString('hex')}@fiche.malodge.invalid`,
            password: passwordHash,
            firstName,
            lastName: rest.join(' '),
            role,
            canLogin: false,
            ...data,
          },
          select: { id: true },
        })
      ).id;
      userIds.set(k, id);
      report.people[role].created++;
    }
    touched.add(k);
    if (role === 'PROVIDER' && !providerByUser.has(id)) {
      providerByUser.set(id, (await tx.provider.create({ data: { userId: id }, select: { id: true } })).id);
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
    await person(role, p.name, {
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
    const ownerId = ownerName ? await person('OWNER', ownerName) : null;
    const existing = villaIds.get(k);
    if (existing) {
      await tx.villa.update({ where: { id: existing }, data: { currency: CURRENCY, ...(ownerId ? { ownerId } : {}) } });
      report.villas.updated.push(name);
    } else {
      const v = await tx.villa.create({
        data: { name, slug: uniqueSlug(name, villaSlugs), address: 'À compléter', city: 'Marrakech', country: 'Maroc', currency: CURRENCY, ownerId, isActive: true },
        select: { id: true },
      });
      villaIds.set(k, v.id);
      report.villas.created.push(name);
    }
  }
  if (report.villas.created.length) warn(`Villas créées avec une adresse à compléter : ${report.villas.created.join(', ')}.`);

  // Catalogue
  for (const c of data.catalogue) {
    let categoryId = categoryIds.get(key(c.category));
    if (!categoryId) {
      categoryId = (await tx.serviceCategory.create({ data: { name: c.category, slug: uniqueSlug(c.category, categorySlugs) }, select: { id: true } })).id;
      categoryIds.set(key(c.category), categoryId);
      report.catalogue.categoriesCreated.push(c.category);
    }
    const providerUser = c.provider ? await person('PROVIDER', c.provider) : null;
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
      await tx.service.update({ where: { id: existing }, data: fields });
      report.catalogue.updated++;
    } else {
      const s = await tx.service.create({ data: { ...fields, name: c.name, slug: uniqueSlug(c.name, serviceSlugs), isActive: true }, select: { id: true } });
      serviceIds.set(key(c.name), s.id);
      report.catalogue.created++;
    }
  }

  // Stays (clients)
  const stays = new Map<string, { id: string; clientId: string; villaId: string }>();
  async function stay(label: string, villaName: string, info?: (typeof data.people)[number]) {
    const k = key(label);
    if (stays.has(k)) return stays.get(k)!;
    const villaId = villaIds.get(key(villaName));
    if (!villaId) return null;
    const clientId = await person('CLIENT', label, info?.contact ? { phone: info.contact } : {});
    const own = data.extras.filter((e) => key(e.stay) === k && e.date).map((e) => e.date!.getTime());
    const checkIn = info?.arrival ?? (own.length ? new Date(Math.min(...own)) : new Date());
    const checkOut = info?.departure ?? (own.length ? new Date(Math.max(...own)) : checkIn);
    const notes = [info?.notes, info?.arrival ? null : "Dates non renseignées dans l'Excel : déduites des extras, à vérifier."].filter(Boolean).join(' ');
    const s = await tx.reservation.create({
      data: { label, villaId, clientId, checkIn, checkOut, totalAmount: 0, status: 'CONFIRMED', archived: info?.archived ?? false, source: 'extras-import', notes: notes || null },
      select: { id: true },
    });
    const entry = { id: s.id, clientId, villaId };
    stays.set(k, entry);
    report.stays.created++;
    return entry;
  }
  for (const p of data.people.filter((x) => x.type === 'Client')) {
    if (!p.villa) {
      warn(`Séjour « ${p.name} » sans villa : créé seulement s'il a des extras.`);
      continue;
    }
    await stay(p.name, p.villa, p);
  }

  // Extras
  for (const e of data.extras) {
    let s = stays.get(key(e.stay)) ?? null;
    if (!s && e.stay && e.villa) {
      s = await stay(e.stay, e.villa);
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
    const providerUser = e.provider ? await person('PROVIDER', e.provider) : null;
    const sellerId = e.seller ? await person('EMPLOYEE', e.seller) : null;
    const qty = e.qty ?? 0;
    const total = e.price != null ? Math.round(qty * e.price * 100) / 100 : 0;
    await tx.order.create({
      data: {
        clientId: s.clientId,
        reservationId: s.id,
        villaId: (e.villa && villaIds.get(key(e.villa))) || s.villaId,
        providerId: providerUser ? providerByUser.get(providerUser)! : null,
        sellerId,
        status: e.status,
        scheduledAt: e.date,
        notes: e.note || null,
        totalAmount: total,
        items: {
          create: { serviceId, label: serviceId ? null : e.label || 'À compléter', quantity: qty, unitPrice: e.price ?? 0, unitCost: e.cost, total },
        },
      },
      select: { id: true },
    });
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
      personId = await person(kind.startsWith('PROVIDER') ? 'PROVIDER' : kind.startsWith('OWNER') ? 'OWNER' : 'EMPLOYEE', st.person);
    }
    const status = st.validation === 'Annulé' ? 'CANCELLED' : st.validation === 'Validé' && st.date ? 'VALIDATED' : 'PENDING';
    if (st.validation === 'Validé' && !st.date) warn(`Règlement de ${st.person} (${st.amount} ${CURRENCY}) sans date : importé « à valider ».`);
    const note = [st.note, st.validation === 'Validé' && !st.date ? "Importé « à valider » : date manquante dans l'Excel." : null].filter(Boolean).join(' ');
    await tx.settlement.create({
      data: {
        kind: kind as any, status, personId, reservationId, date: st.date, amount: st.amount!, currency: CURRENCY,
        method: st.method, reference: st.reference || null, note: note || null,
        validatedAt: status === 'VALIDATED' ? new Date() : null,
      },
      select: { id: true },
    });
    report.settlements[status === 'VALIDATED' ? 'validated' : status === 'PENDING' ? 'pending' : 'cancelled']++;
  }

  await tx.appSetting.upsert({ where: { key: MARKUP_KEY }, update: {}, create: { key: MARKUP_KEY, value: 0.25 } });
  const stamp = { file: report.file, at: new Date().toISOString(), extras: report.extras, settlements: data.settlements.length };
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
    stays: { created: 0, fromExtras: [] },
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
      { maxWait: 10_000, timeout: 120_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  report.durationMs = Date.now() - started;
  return report;
}
