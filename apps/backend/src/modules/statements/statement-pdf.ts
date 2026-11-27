import type { StatementData } from './statement';
import { brandHeader, DocCompany, pageFooters, PDF, plain } from '../../common/pdf-brand';

/** "12 345,67" with plain spaces (the PDF's built-in font has no narrow no-break space). */
export function amount(n: number | null | undefined, currency?: string) {
  if (n == null || !Number.isFinite(n)) return '—';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const body = `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec === '00' ? '' : `,${dec}`}`;
  const sign = n < 0 ? '-' : '';
  return currency ? `${sign}${body} ${currency === 'EUR' ? '€' : currency}` : `${sign}${body}`;
}

const frDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const { ink: INK, body: BODY, muted: MUTED, accent: ACCENT, line: LINE, soft: SOFT, peach: PEACH } = PDF;

/** The company signing the statement (Paramètres › Général), or its name only. */
export type StatementCompany = DocCompany;

interface Column {
  title: string;
  width: number;
  align?: 'left' | 'right';
}

/** The owner's statement as a PDF (A4, in French), signed with the company's name and contacts. */
export async function statementPdf(s: StatementData, company?: StatementCompany | string | null): Promise<Buffer> {
  const co: StatementCompany = typeof company === 'string' ? { name: company } : company ?? { name: 'Malodge Club' };
  const pdfkit: any = await import('pdfkit');
  const PDFDocument = pdfkit.default ?? pdfkit; // CommonJS module: no default export once compiled
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Relevé ${s.monthLabel} — ${s.owner.name}`, Author: co.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = 48;
  const width = doc.page.width - 96;
  const bottom = doc.page.height - 70;
  const ensure = (h: number) => {
    if (doc.y + h > bottom) doc.addPage();
  };
  const t = s.totals;

  /* ── Header: logo, company contacts ── */
  brandHeader(doc, co, left, width);

  /* ── Title ── */
  doc.font('Helvetica-Bold').fontSize(8).fillColor(ACCENT).text('RELEVÉ PROPRIÉTAIRE', left, 118, { characterSpacing: 1.4 });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(INK).text(cap(s.monthLabel), left, 132);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${s.owner.name}  ·  du ${frDate(s.period.start)} au ${frDate(s.period.end)}`, left, doc.y + 2);
  if (s.houses.length) doc.text(s.houses.map((h) => h.name).join('  ·  '), left, doc.y + 1, { width });

  /* ── Key figures ── */
  const cardsTop = doc.y + 18;
  const gap = 10;
  const cw = (width - 2 * gap) / 3;
  const cards: [string, string, boolean][] = [
    ['Total dû pour le mois', amount(t.due, 'MAD'), false],
    ['Déjà versé', amount(t.paid, 'MAD'), false],
    ['Reste à verser', amount(t.remaining, 'MAD'), true],
  ];
  cards.forEach(([label, value, strong], i) => {
    const x = left + i * (cw + gap);
    doc.roundedRect(x, cardsTop, cw, 62, 12).fill(strong ? ACCENT : SOFT);
    doc.font('Helvetica').fontSize(8.5).fillColor(strong ? '#FFFFFF' : MUTED).text(label, x + 14, cardsTop + 13, { width: cw - 28, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(strong ? '#FFFFFF' : INK).text(value, x + 14, cardsTop + 31, { width: cw - 28, lineBreak: false });
  });

  /* ── How the total is made ── */
  doc.y = cardsTop + 62 + 20;
  const breakdown: [string, string, 'strong' | 'total' | null][] = [
    ['Nuits louées dans le mois', String(t.nights), null],
    ['CA hébergement du mois', amount(t.gross, 'MAD'), null],
    ['Commission de gestion', amount(-t.fee, 'MAD'), null],
    ['Net hébergement', amount(t.net, 'MAD'), 'strong'],
    ['Votre part sur les extras', amount(t.extras, 'MAD'), null],
    ['Total dû pour le mois', amount(t.due, 'MAD'), 'total'],
  ];
  breakdown.forEach(([label, value, kind]) => {
    const y = doc.y;
    if (kind === 'total') doc.moveTo(left, y - 2).lineTo(left + width, y - 2).strokeColor(INK).lineWidth(0.8).stroke();
    doc.font(kind ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(kind ? INK : BODY);
    doc.text(label, left, y + 4, { width: width / 2, lineBreak: false });
    doc.text(value, left + width / 2, y + 4, { width: width / 2, align: 'right', lineBreak: false });
    if (!kind || kind === 'strong') doc.moveTo(left, y + 20).lineTo(left + width, y + 20).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.y = y + 21;
  });
  doc.x = left;
  doc.y += 14;

  /* ── Sections and tables ── */
  const section = (text: string, sub?: string) => {
    ensure(110);
    const y = doc.y + 6;
    doc.roundedRect(left, y + 1, 3, 13, 1.5).fill(ACCENT);
    doc.font('Helvetica-Bold').fontSize(12.5).fillColor(INK).text(text, left + 11, y, { width: width - 11 });
    if (sub) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(sub, left + 11, doc.y + 1, { width: width - 11 });
    doc.y += 8;
    doc.x = left;
  };
  const empty = (text: string) => {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(text, left + 11, doc.y);
    doc.x = left;
    doc.moveDown(1.2);
  };

  const table = (columns: Column[], rows: string[][], opts: { totals?: number; quiet?: (row: number, col: number) => boolean } = {}) => {
    const rowH = 20;
    const header = () => {
      const y = doc.y;
      doc.roundedRect(left, y, width, rowH, 6).fill(SOFT);
      let x = left;
      doc.font('Helvetica-Bold').fontSize(7.2).fillColor(MUTED);
      columns.forEach((c) => {
        doc.text(c.title.toUpperCase(), x + 6, y + 7, { width: c.width - 12, align: c.align ?? 'left', lineBreak: false, characterSpacing: 0.4 });
        x += c.width;
      });
      doc.y = y + rowH + 2;
    };
    ensure(rowH * 3);
    header();
    const firstTotal = opts.totals != null ? rows.length - opts.totals : rows.length;
    rows.forEach((row, i) => {
      if (doc.y + rowH > bottom) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      const total = i >= firstTotal;
      if (i === firstTotal) doc.moveTo(left, y).lineTo(left + width, y).strokeColor(INK).lineWidth(0.6).stroke();
      let x = left;
      row.forEach((cell, j) => {
        const c = columns[j];
        const last = total && i === rows.length - 1;
        const quiet = !total && opts.quiet?.(i, j);
        doc.font(total ? 'Helvetica-Bold' : quiet ? 'Helvetica-Oblique' : 'Helvetica').fontSize(quiet ? 8 : 8.8).fillColor(last && j === row.length - 1 ? ACCENT : total ? INK : quiet ? MUTED : BODY);
        // A total row: its label spans every column but the last (the amount).
        const span = total && j === 0 ? columns.slice(0, -1).reduce((w, col) => w + col.width, 0) : c.width;
        if (!(total && j > 0 && j < row.length - 1)) doc.text(plain(cell), x + 6, y + 6, { width: span - 12, align: total && j === 0 ? 'left' : c.align ?? 'left', lineBreak: false, ellipsis: true, height: 11 });
        x += c.width;
      });
      if (!total) doc.moveTo(left + 8, y + rowH).lineTo(left + width - 8, y + rowH).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.y = y + rowH;
    });
    doc.x = left;
    doc.y += 14;
  };

  for (const h of s.houses) {
    section(h.name, `Commission de gestion : ${amount(h.feeRate * 100)} %  ·  ${h.nights} nuit${h.nights > 1 ? 's' : ''} louée${h.nights > 1 ? 's' : ''} dans le mois`);
    if (!h.stays.length) {
      empty('Aucun séjour ce mois-ci.');
      continue;
    }
    table(
      [
        { title: 'Client', width: 150 },
        { title: 'Arrivée', width: 66 },
        { title: 'Départ', width: 66 },
        { title: 'Nuits', width: 44, align: 'right' },
        { title: 'Montant du mois', width: 92, align: 'right' },
        { title: 'En MAD', width: width - 418, align: 'right' },
      ],
      [
        ...h.stays.map((st) => [
          st.guest,
          frDate(st.checkIn),
          frDate(st.checkOut),
          `${st.nightsInMonth}/${st.nights}`,
          st.amountMissing ? 'non renseigné' : amount(st.amountInMonth, st.currency),
          st.amountMissing ? '—' : amount(st.amountInMonthMad),
        ]),
        ['CA hébergement', '', '', '', '', amount(h.gross, 'MAD')],
        [`Commission de gestion ${amount(h.feeRate * 100)} %`, '', '', '', '', amount(-h.fee, 'MAD')],
        ['Net hébergement', '', '', '', '', amount(h.net, 'MAD')],
      ],
      { totals: 3, quiet: (i, j) => j >= 4 && !!h.stays[i]?.amountMissing },
    );
  }

  section('Extras du mois', 'Votre part sur la marge des extras réalisés dans vos villas');
  if (!s.extras.length) {
    empty('Aucun extra ce mois-ci.');
  } else {
    // Older statements (before the price and the reason were kept) still print.
    const why = (e: (typeof s.extras)[number]) => {
      const r = 'reason' in e && e.reason ? String(e.reason) : '';
      // Short in the table; « À savoir » below explains each case in full.
      if (/pas encore réalisé|pas réalisé|réalis/i.test(r)) return 'pas réalisé';
      if (/taux/i.test(r)) return 'taux manquant';
      if (/coût/i.test(r)) return 'coût manquant';
      return 'à compléter';
    };
    table(
      [
        { title: 'Date', width: 62 },
        { title: 'Prestation', width: 152 },
        { title: 'Séjour', width: 94 },
        { title: 'Prix', width: 64, align: 'right' },
        { title: 'Votre part', width: 70, align: 'right' },
        { title: 'En MAD', width: width - 442, align: 'right' },
      ],
      [
        ...s.extras.map((e) => [
          frDate(e.date),
          e.label,
          e.stay ?? '—',
          'price' in e && e.price != null ? amount(e.price, e.currency) : '—',
          e.incomplete ? why(e) : amount(e.ownerShare, e.currency),
          e.incomplete ? '—' : amount(e.ownerShareMad),
        ]),
        ['Votre part sur les extras', '', '', '', '', amount(t.extras, 'MAD')],
      ],
      { totals: 1, quiet: (i, j) => j >= 4 && !!s.extras[i]?.incomplete },
    );
  }

  if (s.payments.length) {
    section('Versements du mois');
    table(
      [
        { title: 'Date', width: 70 },
        { title: 'Type', width: 170 },
        { title: 'Référence', width: 140 },
        { title: 'Montant', width: width - 380, align: 'right' },
      ],
      [
        ...s.payments.map((p) => [frDate(p.date), p.kind === 'OWNER_PAYOUT' ? 'Versement au propriétaire' : 'Reçu du propriétaire', p.reference ?? '—', amount(p.amountMad, 'MAD')]),
        ['Déjà versé', '', '', amount(t.paid, 'MAD')],
      ],
      { totals: 1 },
    );
  }

  /* ── Good to know ── */
  const notes = [
    'Chaque séjour compte pour ses nuits du mois (arrivée incluse, départ exclu) ; un séjour à cheval sur deux mois est réparti au prorata des nuits.',
    s.fx.eurToMad ? `Montants en euros convertis au taux du ${frDate(s.fx.date)} : 1 € = ${amount(s.fx.eurToMad)} MAD.` : null,
    ...s.warnings,
  ].filter(Boolean) as string[];
  doc.font('Helvetica').fontSize(8);
  const notesH = notes.reduce((hgt, n) => hgt + doc.heightOfString(`• ${plain(n)}`, { width: width - 28 }) + 3, 0) + 34;
  ensure(notesH);
  const nTop = doc.y;
  doc.roundedRect(left, nTop, width, notesH, 12).fill(PEACH);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('À savoir', left + 14, nTop + 12);
  doc.font('Helvetica').fontSize(8).fillColor(BODY);
  let ny = nTop + 27;
  notes.forEach((n) => {
    doc.text(`• ${plain(n)}`, left + 14, ny, { width: width - 28 });
    ny = doc.y + 3;
  });

  /* ── Footer of every page ── */
  pageFooters(doc, `${co.name}  ·  Relevé ${s.monthLabel}  ·  ${s.owner.name}`, left, width);

  doc.end();
  return done;
}
