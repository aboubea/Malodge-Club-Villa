import { describe, expect, it } from 'vitest';
import { ColSpec, filterAndSort } from './tableControls';

type Row = { name: string | null; amount: number | null; date: string | null; status: string };
const rows: Row[] = [
  { name: 'Élodie', amount: 500, date: '2026-11-10', status: 'Réalisée' },
  { name: 'adam', amount: null, date: null, status: 'Confirmée' },
  { name: 'Zoé', amount: 1_200, date: '2026-10-02', status: 'Réalisée' },
  { name: null, amount: 80, date: '2026-11-27', status: 'À confirmer' },
];
const cols: ColSpec<Row>[] = [
  { key: 'name', label: 'Client', value: (r) => r.name },
  { key: 'amount', label: 'Montant', kind: 'number', value: (r) => r.amount },
  { key: 'date', label: 'Date', kind: 'date', value: (r) => r.date },
  { key: 'status', label: 'Statut', value: (r) => r.status },
];
const names = (r: Row[]) => r.map((x) => x.name);

describe('table sort and filters', () => {
  it('sorts names the French way (accents, case), empty cells last both ways', () => {
    expect(names(filterAndSort(rows, cols, { key: 'name', dir: 'asc' }, {}))).toEqual(['adam', 'Élodie', 'Zoé', null]);
    expect(names(filterAndSort(rows, cols, { key: 'name', dir: 'desc' }, {}))).toEqual(['Zoé', 'Élodie', 'adam', null]);
  });

  it('sorts amounts and dates as numbers and days', () => {
    expect(names(filterAndSort(rows, cols, { key: 'amount', dir: 'desc' }, {}))).toEqual(['Zoé', 'Élodie', null, 'adam']);
    expect(names(filterAndSort(rows, cols, { key: 'date', dir: 'asc' }, {}))).toEqual(['Zoé', 'Élodie', null, 'adam']);
  });

  it('filters by ticked values, amount range and date range, together', () => {
    expect(names(filterAndSort(rows, cols, null, { status: { values: ['Réalisée'] } }))).toEqual(['Élodie', 'Zoé']);
    expect(names(filterAndSort(rows, cols, null, { amount: { min: '100', max: '1000' } }))).toEqual(['Élodie']);
    expect(names(filterAndSort(rows, cols, null, { date: { from: '2026-11-01' } }))).toEqual(['Élodie', null]);
    expect(names(filterAndSort(rows, cols, null, { status: { values: ['Réalisée'] }, date: { from: '2026-11-01' } }))).toEqual(['Élodie']);
    // An empty cell is found under "(vide)".
    expect(names(filterAndSort(rows, cols, null, { name: { values: ['(vide)'] } }))).toEqual([null]);
  });
});
