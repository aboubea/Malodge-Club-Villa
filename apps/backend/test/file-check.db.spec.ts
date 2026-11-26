import * as ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importExtrasWorkbook } from '../src/modules/extras/extras-import';
import { checkExtrasFile } from '../src/modules/extras/extras-file-check';
import { testDb, wipe } from './db';

/** The spreadsheet compared with the app, line by line. */
const prisma = testDb();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function workbook(extraRows: unknown[][] = []) {
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, rows: unknown[][]) => {
    const ws = wb.addWorksheet(name);
    rows.forEach((values, i) => values.forEach((v, c) => v !== undefined && (ws.getRow(6 + i).getCell(c + 1).value = v as ExcelJS.CellValue)));
  };
  sheet('Réglages', [
    ['Client', 'Famille Martin', null, null, null, 'Villa Test', d('2026-08-08'), d('2026-08-15'), null, null, undefined, 'Villa Test', 'Laurence'],
    ['Prestataire', 'Quad Atlas'],
    ['Propriétaire', 'Laurence', 0.5, 'Marge totale', null, 'Villa Test'],
  ]);
  sheet('Catalogue extras', [['Quad Agafay', 'Activités', 'pers', 300, 500, 500, 'Quad Atlas']]);
  sheet('Extras', [
    [d('2026-08-10'), 'Famille Martin', 'Villa Test', 'Quad Agafay', 'Quad Atlas', 2, 500, 300, null, null, null, 'Réalisée'],
    [d('2026-08-11'), 'Famille Martin', 'Villa Test', 'Quad Agafay', 'Quad Atlas', 1, 500, 300, null, null, null, 'Confirmée'],
    ...extraRows,
  ]);
  sheet('Saisie règlements', [['Famille Martin', d('2026-08-12'), 1_000, 'Validé', 'Reçu client', null, null, 'Espèces']]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(async () => {
  await wipe(prisma);
  await importExtrasWorkbook(prisma as any, await workbook(), { fileName: 'test.xlsx' });
});
afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('comparing the extras spreadsheet with the app', () => {
  it('finds everything identical right after the import', async () => {
    const r = await checkExtrasFile(prisma as any, await workbook());
    expect(r.summary.extra).toEqual({ ok: 2, diff: 0, missing: 0, appOnly: 0 });
    expect(r.summary.settlement).toEqual({ ok: 1, diff: 0, missing: 0, appOnly: 0 });
    expect(r.summary.stay).toEqual({ ok: 1, diff: 0, missing: 0, appOnly: 0 });
    expect(r.lines.filter((l) => l.state !== 'ok')).toEqual([]);
  });

  it('shows each field that differs, a line missing from the app, and one only in the app', async () => {
    const order = await prisma.order.findFirstOrThrow({ where: { scheduledAt: d('2026-08-11') }, include: { items: true } });
    await prisma.order.update({ where: { id: order.id }, data: { scheduledAt: d('2026-08-13'), status: 'COMPLETED', totalAmount: 450 } });
    await prisma.orderItem.update({ where: { id: order.items[0].id }, data: { unitPrice: 450, total: 450, unitCost: 250 } });
    const settlement = await prisma.settlement.findFirstOrThrow();
    await prisma.settlement.update({ where: { id: settlement.id }, data: { amount: 900 } });
    // Added in the app since the file.
    const stay = await prisma.reservation.findFirstOrThrow();
    await prisma.order.create({ data: { clientId: stay.clientId, reservationId: stay.id, villaId: stay.villaId, status: 'CONFIRMED', scheduledAt: d('2026-08-12'), totalAmount: 200, items: { create: [{ label: 'Massage', quantity: 1, unitPrice: 200, total: 200 }] } } });

    // A line of the file never entered in the app.
    const r = await checkExtrasFile(prisma as any, await workbook([[d('2026-08-14'), 'Famille Martin', 'Villa Test', 'Hammam', 'Quad Atlas', 1, 300, 150, null, null, null, 'Confirmée']]));
    const diff = r.lines.find((l) => l.kind === 'extra' && l.state === 'diff')!;
    expect(diff.where).toBe('Extras ligne 7');
    expect(Object.fromEntries(diff.diffs.map((x) => [x.field, [x.file, x.app]]))).toEqual({
      Date: ['11/08/2026', '13/08/2026'],
      'Prix client (total)': ['500 MAD', '450 MAD'],
      'Coût prestataire (total)': ['300 MAD', '250 MAD'],
      Statut: ['Confirmée', 'Réalisée'],
    });
    expect(r.lines.find((l) => l.state === 'missing')).toMatchObject({ kind: 'extra', where: 'Extras ligne 8' });
    expect(r.lines.find((l) => l.state === 'appOnly')).toMatchObject({ kind: 'extra' });
    expect(r.lines.find((l) => l.kind === 'settlement')!.diffs).toEqual([{ field: 'Montant', file: '1 000 MAD', app: '900 MAD' }]);
  });
});
