#!/usr/bin/env node
/**
 * Generates the two PDFs (owner statement, finance export) from the compiled code,
 * as on the server: Vitest runs the TypeScript sources, where module interop differs.
 */
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const { statementPdf } = require(path.join(dist, 'modules', 'statements', 'statement-pdf'));
const { buildStatement } = require(path.join(dist, 'modules', 'statements', 'statement'));

(async () => {
  const data = buildStatement({
    owner: { id: 'o', name: 'Propriétaire Test', email: null },
    month: '2026-11',
    houses: [{ id: 'h', name: 'Villa Test', feeRate: 0.2 }],
    stays: [{ id: 's', house: 'h', villa: 'Villa Test', guest: 'Voyageur', checkIn: new Date('2026-11-02'), checkOut: new Date('2026-11-06'), totalAmount: 4000, currency: 'MAD' }],
    extras: [{ date: new Date('2026-11-03'), label: 'Quad', stay: 'Voyageur', villa: 'Villa Test', ownerShare: 120, currency: 'MAD' }],
    payments: [],
    toMad: (a) => a,
    fx: { eurToMad: 10.96, date: '2026-11-26' },
  });
  const pdf = await statementPdf(data);
  if (pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('statement PDF invalide');
  console.log(`[smoke] relevé PDF OK (${pdf.length} octets)`);
})().catch((e) => {
  console.error('[smoke] ÉCHEC', e);
  process.exit(1);
});
