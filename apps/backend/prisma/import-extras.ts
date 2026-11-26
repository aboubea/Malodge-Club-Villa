/**
 * Imports the "Suivi extras Malodge Maroc" spreadsheet into the application.
 *
 *   npx ts-node prisma/import-extras.ts <file.xlsx> [--dry-run] [--force]
 *
 * Creates (or reuses, matched by name) people without app access, villas and their owners,
 * catalogue items, stays, extras and settlements. Amounts are in MAD.
 * A second run is refused unless --force is passed, to avoid duplicating extras and settlements.
 */
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const CURRENCY = 'MAD';
const IMPORT_KEY = 'extras.spreadsheetImport';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');

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
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v.replace(',', '.').replace(/\s/g, '')))) {
    return Number(v.replace(',', '.').replace(/\s/g, ''));
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

const report: string[] = [];
const log = (m: string) => {
  report.push(m);
  console.log(m);
};

async function main() {
  if (!file) throw new Error('Usage: ts-node prisma/import-extras.ts <file.xlsx> [--dry-run] [--force]');
  const already = await prisma.appSetting.findUnique({ where: { key: IMPORT_KEY } });
  if (already && !FORCE) {
    throw new Error(`Import déjà effectué (${JSON.stringify(already.value)}). Relancer avec --force pour importer à nouveau.`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Onglet « ${name} » introuvable`);
    return ws;
  };
  const rows = (name: string, from: number, to: number) => {
    const ws = sheet(name);
    const out: ExcelJS.Row[] = [];
    for (let r = from; r <= Math.min(to, ws.rowCount); r++) out.push(ws.getRow(r));
    return out;
  };

  /* ── 1. Réglages: people and villas ── */
  type Person = { type: string; name: string; rate: number | null; base: string; contact: string; villa: string; arrival: Date | null; departure: Date | null; archived: boolean; notes: string };
  const people: Person[] = [];
  for (const row of rows('Réglages', 6, 304)) {
    const type = str(row.getCell(1).value);
    const name = str(row.getCell(2).value);
    if (!type || !name) continue;
    people.push({
      type,
      name,
      rate: num(row.getCell(3).value),
      base: str(row.getCell(4).value),
      contact: str(row.getCell(5).value),
      villa: str(row.getCell(6).value),
      arrival: date(row.getCell(7).value),
      departure: date(row.getCell(8).value),
      archived: str(row.getCell(9).value) === 'Archivé',
      notes: str(row.getCell(10).value),
    });
  }
  const villaRows = rows('Réglages', 6, 29)
    .map((r) => ({ name: str(r.getCell(12).value), owner: str(r.getCell(13).value) }))
    .filter((v) => v.name);

  /* ── 2. Catalogue ── */
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

  /* ── 3. Extras & settlements ── */
  const STATUS: Record<string, 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'> = {
    'À confirmer': 'PENDING', Confirmée: 'CONFIRMED', Réalisée: 'COMPLETED', Annulée: 'CANCELLED',
  };
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
      status: STATUS[str(r.getCell(12).value)] ?? 'PENDING',
      note: str(r.getCell(14).value),
    }))
    .filter((e) => e.label || e.stay);

  const METHOD: Record<string, 'CASH' | 'TRANSFER' | 'CARD' | 'MANUAL'> = { Espèces: 'CASH', Virement: 'TRANSFER', Carte: 'CARD', Autre: 'MANUAL' };
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

  log(`Lu : ${people.length} personnes, ${villaRows.length} villas, ${catalogue.length} prestations, ${extras.length} extras, ${settlements.length} règlements.`);
  if (DRY) return;

  /* ── Write ── */
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
  const ROLE: Record<string, 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE'> = {
    Client: 'CLIENT', Prestataire: 'PROVIDER', Propriétaire: 'OWNER', Salarié: 'EMPLOYEE',
  };
  const userIds = new Map<string, string>(); // `${role}|${key(name)}` → user id

  async function findOrCreateUser(role: 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE', name: string, data: Record<string, unknown> = {}) {
    const k = `${role}|${key(name)}`;
    if (userIds.has(k)) return userIds.get(k)!;
    const [firstName, ...rest] = name.split(/\s+/);
    const candidates = await prisma.user.findMany({ where: { role, firstName: { equals: firstName, mode: 'insensitive' } } });
    let user = candidates.find((u) => key(`${u.firstName} ${u.lastName}`) === key(name));
    if (user) {
      if (Object.keys(data).length) await prisma.user.update({ where: { id: user.id }, data });
    } else {
      user = await prisma.user.create({
        data: {
          email: `${slugify(name)}-${randomBytes(4).toString('hex')}@fiche.malodge.invalid`,
          password: passwordHash,
          firstName,
          lastName: rest.join(' '),
          role,
          canLogin: false,
          ...data,
        },
      });
      log(`  + ${role} « ${name} » (fiche sans accès)`);
    }
    if (role === 'PROVIDER') {
      const p = await prisma.provider.findUnique({ where: { userId: user.id } });
      if (!p) await prisma.provider.create({ data: { userId: user.id } });
    }
    userIds.set(k, user.id);
    return user.id;
  }

  // Owners, employees, providers
  for (const p of people.filter((x) => x.type !== 'Client')) {
    const role = ROLE[p.type];
    if (!role) {
      log(`  ! Type inconnu « ${p.type} » pour ${p.name} — ignoré`);
      continue;
    }
    await findOrCreateUser(role, p.name, {
      phone: p.contact || null,
      notes: p.notes || null,
      ...(role === 'OWNER' || role === 'EMPLOYEE' ? { commissionRate: p.rate } : {}),
      ...(role === 'EMPLOYEE' ? { commissionBase: p.base === 'Marge totale' ? 'TOTAL_MARGIN' : 'MALODGE_MARGIN' } : {}),
    });
  }

  // Villas (matched by name) with owner and MAD currency
  const villaIds = new Map<string, string>();
  const allVillaNames = new Set([...villaRows.map((v) => v.name), ...people.map((p) => p.villa).filter(Boolean), ...extras.map((e) => e.villa).filter(Boolean)]);
  for (const name of allVillaNames) {
    const ownerName = villaRows.find((v) => key(v.name) === key(name))?.owner;
    const ownerId = ownerName ? await findOrCreateUser('OWNER', ownerName) : null;
    const existing = (await prisma.villa.findMany({ where: { name: { equals: name, mode: 'insensitive' } } }))[0];
    if (existing) {
      await prisma.villa.update({ where: { id: existing.id }, data: { currency: CURRENCY, ...(ownerId ? { ownerId } : {}) } });
      villaIds.set(key(name), existing.id);
    } else {
      let slug = slugify(name);
      if (await prisma.villa.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString('hex')}`;
      const v = await prisma.villa.create({
        data: { name, slug, address: 'À compléter', city: 'Marrakech', country: 'Maroc', currency: CURRENCY, ownerId, isActive: true },
      });
      villaIds.set(key(name), v.id);
      log(`  + Villa « ${name} » (Marrakech, Maroc — adresse à compléter)`);
    }
  }

  // Catalogue
  const serviceIds = new Map<string, string>();
  const categoryIds = new Map<string, string>();
  for (const c of catalogue) {
    let categoryId = categoryIds.get(key(c.category));
    if (!categoryId) {
      const cat = (await prisma.serviceCategory.findMany({ where: { name: { equals: c.category, mode: 'insensitive' } } }))[0]
        ?? (await prisma.serviceCategory.create({ data: { name: c.category, slug: `${slugify(c.category)}-${randomBytes(2).toString('hex')}` } }));
      categoryId = cat.id;
      categoryIds.set(key(c.category), categoryId);
    }
    const defaultProviderUser = c.provider ? await findOrCreateUser('PROVIDER', c.provider) : null;
    const defaultProviderId = defaultProviderUser ? (await prisma.provider.findUnique({ where: { userId: defaultProviderUser } }))!.id : null;
    const price = c.proposed ?? c.publicPrice ?? (c.unitCost != null ? Math.round(c.unitCost * 1.25) : 0);
    const data = {
      categoryId, unit: c.unit || null, unitCost: c.unitCost, publicPrice: c.publicPrice,
      basePrice: price, currency: CURRENCY, defaultProviderId,
    };
    const existing = (await prisma.service.findMany({ where: { name: c.name } }))[0];
    if (existing) {
      await prisma.service.update({ where: { id: existing.id }, data });
      serviceIds.set(key(c.name), existing.id);
    } else {
      let slug = slugify(c.name);
      if (await prisma.service.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(3).toString('hex')}`;
      const s = await prisma.service.create({ data: { ...data, name: c.name, slug, isActive: true } });
      serviceIds.set(key(c.name), s.id);
    }
  }
  log(`  Catalogue : ${serviceIds.size} prestations.`);

  // Stays (clients)
  const stayIds = new Map<string, { id: string; clientId: string; villaId: string }>();
  async function ensureStay(label: string, villaName: string, info?: Person) {
    const k = key(label);
    if (stayIds.has(k)) return stayIds.get(k)!;
    const villaId = villaIds.get(key(villaName));
    if (!villaId) return null;
    const clientId = await findOrCreateUser('CLIENT', label, info?.contact ? { phone: info.contact } : {});
    const own = extras.filter((e) => key(e.stay) === k && e.date).map((e) => e.date!.getTime());
    const checkIn = info?.arrival ?? (own.length ? new Date(Math.min(...own)) : new Date());
    const checkOut = info?.departure ?? (own.length ? new Date(Math.max(...own)) : checkIn);
    const noteParts = [info?.notes, info?.arrival ? null : "Dates non renseignées dans l'Excel : déduites des extras, à vérifier."].filter(Boolean);
    const stay = await prisma.reservation.create({
      data: {
        label, villaId, clientId, checkIn, checkOut, totalAmount: 0, status: 'CONFIRMED',
        archived: info?.archived ?? false, source: 'extras-import', notes: noteParts.join(' ') || null,
      },
    });
    const entry = { id: stay.id, clientId, villaId };
    stayIds.set(k, entry);
    return entry;
  }
  for (const p of people.filter((x) => x.type === 'Client')) {
    if (!p.villa) {
      log(`  ! Séjour « ${p.name} » sans villa — créé plus tard s'il a des extras`);
      continue;
    }
    await ensureStay(p.name, p.villa, p);
  }

  // Extras
  let extraCount = 0;
  for (const e of extras) {
    let stay = stayIds.get(key(e.stay)) ?? null;
    if (!stay && e.stay && e.villa) {
      stay = await ensureStay(e.stay, e.villa);
      if (stay) log(`  + Séjour « ${e.stay} » créé depuis l'extra ligne ${e.row} (absent des réglages — à vérifier)`);
    }
    if (!stay) {
      log(`  ! Extra ligne ${e.row} ignoré : séjour « ${e.stay || '—'} » introuvable`);
      continue;
    }
    const serviceId = serviceIds.get(key(e.label)) ?? null;
    const providerUser = e.provider ? await findOrCreateUser('PROVIDER', e.provider) : null;
    const providerId = providerUser ? (await prisma.provider.findUnique({ where: { userId: providerUser } }))!.id : null;
    const sellerId = e.seller ? await findOrCreateUser('EMPLOYEE', e.seller) : null;
    const explicitVilla = e.villa ? villaIds.get(key(e.villa)) : null;
    const qty = e.qty ?? 0;
    const total = e.price != null ? Math.round(qty * e.price * 100) / 100 : 0;
    await prisma.order.create({
      data: {
        clientId: stay.clientId,
        reservationId: stay.id,
        villaId: explicitVilla ?? stay.villaId,
        providerId,
        sellerId,
        status: e.status,
        scheduledAt: e.date,
        notes: e.note || null,
        totalAmount: total,
        items: {
          create: {
            serviceId,
            label: serviceId ? null : e.label || 'À compléter',
            quantity: qty,
            unitPrice: e.price ?? 0,
            unitCost: e.cost,
            total,
          },
        },
      },
    });
    extraCount++;
  }
  log(`  Extras : ${extraCount} importés.`);

  // Settlements
  const KIND: Record<string, string> = {
    'Reçu client': 'CLIENT_PAYMENT', 'Remboursé au client': 'CLIENT_REFUND',
    'Payé au prestataire': 'PROVIDER_PAYMENT', 'Reçu du prestataire': 'PROVIDER_REFUND',
    'Versé au propriétaire': 'OWNER_PAYOUT', 'Reçu du propriétaire': 'OWNER_REFUND',
    'Versé au salarié': 'EMPLOYEE_PAYOUT', 'Reçu du salarié': 'EMPLOYEE_REFUND',
  };
  let settlementCount = 0;
  for (const s of settlements) {
    const kind = KIND[s.type] ?? (stayIds.has(key(s.person)) ? 'CLIENT_PAYMENT' : null);
    if (!kind) {
      log(`  ! Règlement ligne ${s.row} ignoré : type « ${s.type} » inconnu`);
      continue;
    }
    let personId: string | null = null;
    let reservationId: string | null = null;
    if (kind.startsWith('CLIENT')) {
      const stay = stayIds.get(key(s.person));
      if (!stay) {
        log(`  ! Règlement ligne ${s.row} ignoré : séjour « ${s.person} » introuvable`);
        continue;
      }
      personId = stay.clientId;
      reservationId = stay.id;
    } else {
      const role = kind.startsWith('PROVIDER') ? 'PROVIDER' : kind.startsWith('OWNER') ? 'OWNER' : 'EMPLOYEE';
      personId = await findOrCreateUser(role, s.person);
    }
    // As in the spreadsheet, a settlement only counts once validated with a date.
    const status = s.validation === 'Annulé' ? 'CANCELLED' : s.validation === 'Validé' && s.date ? 'VALIDATED' : 'PENDING';
    const note = [s.note, s.validation === 'Validé' && !s.date ? "Importé « à valider » : date manquante dans l'Excel." : null].filter(Boolean).join(' ');
    await prisma.settlement.create({
      data: {
        kind: kind as any, status, personId, reservationId, date: s.date, amount: s.amount!, currency: CURRENCY,
        method: s.method, reference: s.reference || null, note: note || null,
        validatedAt: status === 'VALIDATED' ? new Date() : null,
      },
    });
    settlementCount++;
  }
  log(`  Règlements : ${settlementCount} importés.`);

  await prisma.appSetting.upsert({
    where: { key: 'extras.catalogMarkup' },
    update: {},
    create: { key: 'extras.catalogMarkup', value: 0.25 },
  });
  await prisma.appSetting.upsert({
    where: { key: IMPORT_KEY },
    update: { value: { file: file.split('/').pop(), at: new Date().toISOString(), extras: extraCount, settlements: settlementCount } },
    create: { key: IMPORT_KEY, value: { file: file.split('/').pop(), at: new Date().toISOString(), extras: extraCount, settlements: settlementCount } },
  });
  log('Import terminé.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
