/**
 * Compares the dates stored in the app with the extras spreadsheet, and puts
 * the spreadsheet's dates back on request.
 *
 * Stays, extras and settlements created by the import are matched to their
 * spreadsheet row by stay (or person) name, by what was sold (or the amount)
 * and, inside such a group, by date order: identical lines are interchangeable.
 * A date missing from the file is expected to be missing from the app too.
 */
import { PrismaClient } from '@prisma/client';
import { IMPORT_KEY, parseWorkbook } from './extras-import';
import { NAME_ALIASES_KEY, applyNameAliases } from './people-merge';

export type DateDiffKind = 'stay' | 'extra' | 'settlement';

export interface DateDiff {
  /** `stay:<id>`, `extra:<id>` or `settlement:<id>`. */
  id: string;
  kind: DateDiffKind;
  label: string;
  /** Where it is in the spreadsheet. */
  where: string;
  app: string | null;
  file: string | null;
  /** Stays only: the second date (departure). */
  app2?: string | null;
  file2?: string | null;
}

export interface DatesCheckReport {
  checked: { stays: number; extras: number; settlements: number };
  diffs: DateDiff[];
  /** Lines of the file the check could not pair with the app (renamed, deleted, added by hand…). */
  unmatched: string[];
  applied: number;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Same service whatever the spacing or "personnes"/"pers." spelling (as the catalogue clean-up). */
const labelKey = (s: string) =>
  norm(s)
    .replace(/\bet\b/g, '&')
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\bpersonnes?\b/g, 'pers')
    .replace(/\bheures?\b/g, 'h')
    .replace(/\s+/g, '');
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const atDay = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
const fullName = (u: { firstName: string; lastName: string } | null) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');
const byDay = (a: string | null, b: string | null) => (a ?? '9999').localeCompare(b ?? '9999');

const KIND: Record<string, string> = {
  'Reçu client': 'CLIENT_PAYMENT', 'Remboursé au client': 'CLIENT_REFUND',
  'Payé au prestataire': 'PROVIDER_PAYMENT', 'Reçu du prestataire': 'PROVIDER_REFUND',
  'Versé au propriétaire': 'OWNER_PAYOUT', 'Reçu du propriétaire': 'OWNER_REFUND',
  'Versé au salarié': 'EMPLOYEE_PAYOUT', 'Reçu du salarié': 'EMPLOYEE_REFUND',
};

export async function checkImportDates(
  prisma: PrismaClient,
  buffer: Buffer,
  opts: { apply?: string[] } = {},
): Promise<DatesCheckReport> {
  const data = await parseWorkbook(buffer);
  // People merged in the app (typos in the file) are compared under the name kept.
  const nameAliases = (await prisma.appSetting.findUnique({ where: { key: NAME_ALIASES_KEY } }))?.value as Record<string, string> | undefined;
  if (nameAliases) applyNameAliases(data, nameAliases);
  const stamp = (await prisma.appSetting.findUnique({ where: { key: IMPORT_KEY } }))?.value as
    | { created?: { reservations?: string[]; orders?: string[]; settlements?: string[] } }
    | undefined;
  const created = stamp?.created;
  const report: DatesCheckReport = { checked: { stays: 0, extras: 0, settlements: 0 }, diffs: [], unmatched: [], applied: 0 };

  /* ── Stays ── */
  const fileStays = new Map<string, { name: string; arrival: string | null; departure: string | null; where: string }>();
  data.people
    .filter((p) => p.type === 'Client')
    .forEach((p) => fileStays.set(norm(p.name), { name: p.name, arrival: day(p.arrival), departure: day(p.departure), where: 'Réglages' }));
  // A stay only named on an extras line has no dates in the file.
  data.extras
    .filter((e) => e.stay && !fileStays.has(norm(e.stay)))
    .forEach((e) => fileStays.set(norm(e.stay), { name: e.stay, arrival: null, departure: null, where: `Extras ligne ${e.row}` }));

  const stays = await prisma.reservation.findMany({
    where: created?.reservations ? { id: { in: created.reservations } } : { label: { not: null } },
    select: { id: true, label: true, checkIn: true, checkOut: true, datesEstimated: true },
  });
  const stayByKey = new Map(stays.map((s) => [norm(s.label ?? ''), s]));
  for (const [k, f] of fileStays) {
    const s = stayByKey.get(k);
    if (!s) {
      report.unmatched.push(`Séjour « ${f.name} » (${f.where})`);
      continue;
    }
    report.checked.stays++;
    const app = day(s.checkIn);
    const app2 = day(s.checkOut);
    if (app !== f.arrival || app2 !== f.departure || s.datesEstimated) {
      report.diffs.push({ id: `stay:${s.id}`, kind: 'stay', label: f.name, where: f.where, app, app2, file: f.arrival, file2: f.departure });
    }
  }

  /* ── Extras ── */
  const orders = await prisma.order.findMany({
    where: created?.orders ? { id: { in: created.orders } } : { reservation: { label: { not: null } } },
    select: {
      id: true,
      scheduledAt: true,
      reservation: { select: { label: true } },
      items: { select: { label: true, service: { select: { name: true } } }, take: 1 },
    },
  });
  const orderGroups = new Map<string, typeof orders>();
  for (const o of orders) {
    const what = o.items[0]?.label ?? o.items[0]?.service?.name ?? '';
    const k = `${norm(o.reservation?.label ?? '')}|${labelKey(what)}`;
    orderGroups.set(k, [...(orderGroups.get(k) ?? []), o]);
  }
  const fileGroups = new Map<string, typeof data.extras>();
  for (const e of data.extras) {
    if (!e.stay) continue;
    const k = `${norm(e.stay)}|${labelKey(e.label || 'À compléter')}`;
    fileGroups.set(k, [...(fileGroups.get(k) ?? []), e]);
  }
  for (const [k, rows] of fileGroups) {
    const group = orderGroups.get(k) ?? [];
    const fileSorted = [...rows].sort((a, b) => byDay(day(a.date), day(b.date)));
    const appSorted = [...group].sort((a, b) => byDay(day(a.scheduledAt), day(b.scheduledAt)));
    if (group.length !== rows.length) {
      report.unmatched.push(
        `Extras « ${rows[0].label || 'À compléter'} » de ${rows[0].stay} (lignes ${rows.map((r) => r.row).join(', ')}) : ${rows.length} dans le fichier, ${group.length} dans l’appli`,
      );
      continue;
    }
    fileSorted.forEach((row, i) => {
      report.checked.extras++;
      const o = appSorted[i];
      const app = day(o.scheduledAt);
      const file = day(row.date);
      if (app !== file) {
        report.diffs.push({ id: `extra:${o.id}`, kind: 'extra', label: `${row.stay} — ${row.label || 'À compléter'}`, where: `Extras ligne ${row.row}`, app, file });
      }
    });
  }

  /* ── Settlements ── */
  const settlements = await prisma.settlement.findMany({
    where: created?.settlements ? { id: { in: created.settlements } } : {},
    select: { id: true, date: true, amount: true, kind: true, person: { select: { firstName: true, lastName: true } } },
  });
  const settleKey = (person: string, amount: number, kind: string) => `${norm(person)}|${Math.round(amount * 100)}|${kind}`;
  const appSettle = new Map<string, typeof settlements>();
  for (const s of settlements) {
    const k = settleKey(fullName(s.person), s.amount, s.kind);
    appSettle.set(k, [...(appSettle.get(k) ?? []), s]);
  }
  const fileSettle = new Map<string, typeof data.settlements>();
  for (const st of data.settlements) {
    const kind = KIND[st.type];
    if (!kind || st.amount == null) continue;
    const k = settleKey(st.person, st.amount, kind);
    fileSettle.set(k, [...(fileSettle.get(k) ?? []), st]);
  }
  for (const [k, rows] of fileSettle) {
    const group = appSettle.get(k) ?? [];
    if (group.length !== rows.length) {
      report.unmatched.push(`Règlement de ${rows[0].person} (${rows[0].amount}, lignes ${rows.map((r) => r.row).join(', ')}) : ${rows.length} dans le fichier, ${group.length} dans l’appli`);
      continue;
    }
    const fileSorted = [...rows].sort((a, b) => byDay(day(a.date), day(b.date)));
    const appSorted = [...group].sort((a, b) => byDay(day(a.date), day(b.date)));
    fileSorted.forEach((row, i) => {
      report.checked.settlements++;
      const s = appSorted[i];
      const app = day(s.date);
      const file = day(row.date);
      if (app !== file) {
        report.diffs.push({ id: `settlement:${s.id}`, kind: 'settlement', label: `${row.person} — ${row.type} ${row.amount}`, where: `Saisie règlements ligne ${row.row}`, app, file });
      }
    });
  }

  /* ── Apply the file's dates to the chosen lines ── */
  if (opts.apply?.length) {
    const chosen = new Set(opts.apply);
    const todo = report.diffs.filter((d) => chosen.has(d.id));
    await prisma.$transaction(
      todo.map((d) => {
        const id = d.id.slice(d.id.indexOf(':') + 1);
        if (d.kind === 'stay') {
          return prisma.reservation.update({ where: { id }, data: { checkIn: atDay(d.file), checkOut: atDay(d.file2 ?? null), datesEstimated: false } });
        }
        if (d.kind === 'extra') return prisma.order.update({ where: { id }, data: { scheduledAt: atDay(d.file) } });
        return prisma.settlement.update({ where: { id }, data: { date: atDay(d.file) } });
      }),
    );
    report.applied = todo.length;
    report.diffs = report.diffs.filter((d) => !chosen.has(d.id));
  }
  return report;
}
