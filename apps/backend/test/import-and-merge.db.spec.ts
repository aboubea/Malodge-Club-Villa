import * as ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importExtrasWorkbook } from '../src/modules/extras/extras-import';
import { mergePeople, NAME_ALIASES_KEY } from '../src/modules/extras/people-merge';
import { testDb, wipe } from './db';

const prisma = testDb();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

/** A small "Suivi extras" spreadsheet, laid out like the real one (data from row 6). */
async function workbook() {
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, rows: unknown[][]) => {
    const ws = wb.addWorksheet(name);
    rows.forEach((values, i) => values.forEach((v, c) => v !== undefined && (ws.getRow(6 + i).getCell(c + 1).value = v as ExcelJS.CellValue)));
  };
  //            type          name            rate  base  contact villa         arrival             departure
  sheet('Réglages', [
    ['Client', 'Famille Martin', null, null, null, 'Villa Test', d('2026-08-08'), d('2026-08-15'), null, null, undefined, 'Villa Test'],
    ['Client', 'Sans Dates', null, null, null, 'Villa Test'],
    ['Client', 'Marck brunet', null, null, null, 'Villa Test', d('2026-09-01'), d('2026-09-05')],
    ['Client', 'Marc brunet', null, null, null, 'Villa Test', d('2026-09-01'), d('2026-09-06')],
    ['Prestataire', 'Quad Atlas'],
  ]);
  sheet('Catalogue extras', [['Quad Agafay', 'Activités', 'pers', 300, 500, 500, 'Quad Atlas']]);
  //       date              stay              villa         label          provider      qty price cost
  sheet('Extras', [
    [d('2026-08-10'), 'Famille Martin', 'Villa Test', 'Quad Agafay', 'Quad Atlas', 2, 500, 300, null, null, null, 'Réalisée'],
    [d('2026-08-20'), 'Sans Dates', 'Villa Test', 'Quad Agafay', 'Quad Atlas', 1, 500, 300, null, null, null, 'Confirmée'],
    [d('2026-09-02'), 'Marck brunet', 'Villa Test', 'Quad Agafay', 'Quad Atlas', 1, 500, 300, null, null, null, 'Réalisée'],
  ]);
  sheet('Saisie règlements', [['Famille Martin', d('2026-08-12'), 1_000, 'Validé', 'Reçu client', null, null, 'Espèces']]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(async () => {
  await wipe(prisma);
});

afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('import of the extras spreadsheet', () => {
  it('keeps the dates of the file, and never invents one', async () => {
    const report = await importExtrasWorkbook(prisma as any, await workbook(), { fileName: 'test.xlsx' });
    expect(report.stays.datesMissing).toEqual(['Sans Dates']);

    const stays = await prisma.reservation.findMany({ select: { label: true, checkIn: true, checkOut: true } });
    const byLabel = Object.fromEntries(stays.map((s) => [s.label, [day(s.checkIn), day(s.checkOut)]]));
    expect(byLabel['Famille Martin']).toEqual(['2026-08-08', '2026-08-15']);
    expect(byLabel['Sans Dates']).toEqual([null, null]);

    const orders = await prisma.order.findMany({ select: { scheduledAt: true, totalAmount: true, reservation: { select: { label: true } } } });
    const martin = orders.find((o) => o.reservation?.label === 'Famille Martin')!;
    expect(day(martin.scheduledAt)).toBe('2026-08-10');
    expect(martin.totalAmount).toBe(1_000);
    // An extra of a stay without dates keeps its own date, and the stay still has none.
    expect(day(orders.find((o) => o.reservation?.label === 'Sans Dates')!.scheduledAt)).toBe('2026-08-20');

    const settlement = await prisma.settlement.findFirstOrThrow();
    expect(settlement).toMatchObject({ status: 'VALIDATED', amount: 1_000, currency: 'MAD' });
    expect(day(settlement.date)).toBe('2026-08-12');
  });

  it('refuses a second import of the same file unless forced', async () => {
    await expect(importExtrasWorkbook(prisma as any, await workbook())).rejects.toThrow();
  });
});

describe('merge of two records of the same person', () => {
  it('moves everything to the record kept, deletes the other, and remembers the old name', async () => {
    const [source, target] = await Promise.all([
      prisma.user.findFirstOrThrow({ where: { firstName: 'Marck', lastName: 'brunet' } }),
      prisma.user.findFirstOrThrow({ where: { firstName: 'Marc', lastName: 'brunet' } }),
    ]);
    await mergePeople(prisma as any, source.id, target.id, { mergeStays: true });

    expect(await prisma.user.findUnique({ where: { id: source.id } })).toBeNull();
    const stays = await prisma.reservation.findMany({ where: { clientId: target.id }, include: { orders: true } });
    // Same villa, same dates (to one day): one stay, keeping the first arrival and the last departure known.
    expect(stays).toHaveLength(1);
    expect([day(stays[0].checkIn), day(stays[0].checkOut)]).toEqual(['2026-09-01', '2026-09-06']);
    expect(stays[0].orders).toHaveLength(1);

    const aliases = (await prisma.appSetting.findUnique({ where: { key: NAME_ALIASES_KEY } }))?.value as Record<string, string>;
    expect(Object.values(aliases)).toContain('Marc brunet');
  });
});

describe('Lodgify as the only source', () => {
  it('refuses the Excel import once retired, and accepts it again once reactivated', async () => {
    const { ExtrasService } = await import('../src/modules/extras/extras.service');
    const { FxService } = await import('../src/modules/fx/fx.service');
    const extras = new ExtrasService(prisma as any, new FxService(prisma as any));
    await extras.setExcelImportRetired(true, 'admin');
    await expect(extras.importWorkbook(await workbook(), { dryRun: true })).rejects.toThrow(/retiré/);
    expect((await extras.importStatus()).retired).toMatchObject({ by: 'admin' });
    await extras.setExcelImportRetired(false, 'admin');
    expect((await extras.importStatus()).retired).toBeNull();
    // Back to the usual answer (the file was already imported above).
    await expect(extras.importWorkbook(await workbook(), { dryRun: true })).rejects.not.toThrow(/retiré/);
  });
});
