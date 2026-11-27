import type { StatementData } from './statement';

/** "12 345,67" with plain spaces (the PDF's built-in font has no narrow no-break space). */
export function amount(n: number | null | undefined, currency?: string) {
  if (n == null || !Number.isFinite(n)) return '—';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const body = `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec === '00' ? '' : `,${dec}`}`;
  const sign = n < 0 ? '-' : '';
  return currency ? `${sign}${body} ${currency === 'EUR' ? '€' : currency}` : `${sign}${body}`;
}

/** The built-in PDF font has no narrow or no-break space (French number formatting): plain spaces. */
const plain = (t: string) => t.replace(/[\u202f\u00a0\u2009]/g, ' ');
const frDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* The app's colours (light theme). */
const INK = '#1D1D1F';
const BODY = '#424245';
const MUTED = '#6E6E73';
const ACCENT = '#B2502C';
const ARCH = '#A84A28';
const LINE = '#E5E5EA';
const SOFT = '#F5F5F7';
const PEACH = '#FAEEE6';

/** The company signing the statement (Paramètres › Général), or its name only. */
export type StatementCompany = { name: string; supportEmail?: string; phone?: string; website?: string };

interface Column {
  title: string;
  width: number;
  align?: 'left' | 'right';
}

/** The MALODGE CLUB symbol (riad arch, sun over the pool), drawn as vectors at `size` points. */
function logoMark(doc: any, x: number, y: number, size: number) {
  doc.save();
  doc.translate(x, y).scale(size / 32);
  doc.path('M4.5 30V14.5C4.5 8 9.6 3.4 16 1.6 22.4 3.4 27.5 8 27.5 14.5V30ZM9.6 30V17.4c0-3.8 2.7-6.6 6.4-7.9 3.7 1.3 6.4 4.1 6.4 7.9V30Z').fill(ARCH, 'even-odd');
  doc.path('M12 22.6a4 4 0 0 1 8 0Z').fill(INK);
  doc.rect(9.6, 24.3, 12.8, 1.7).fill(INK);
  doc.roundedRect(12, 27.4, 8, 1.7, 0.85).fill(INK);
  doc.restore();
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
  logoMark(doc, left, 44, 30);
  doc.font('Helvetica-Bold').fontSize(14.5).fillColor(INK).text('MALODGE', left + 40, 47, { characterSpacing: 2.4, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7.2).fillColor(ARCH).text('CLUB', left + 40.5, 65.5, { characterSpacing: 4.6, lineBreak: false });
  const contacts = [co.supportEmail, co.phone, co.website?.replace(/^https?:\/\//, '')].filter(Boolean) as string[];
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(co.name, left, 46, { width, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  (contacts.length ? contacts : ['Conciergerie de luxe']).forEach((c, i) => doc.text(c, left, 58 + i * 10.5, { width, align: 'right', lineBreak: false }));
  doc.moveTo(left, 96).lineTo(left + width, 96).strokeColor(LINE).lineWidth(0.8).stroke();

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
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing in the bottom margin would otherwise open a new page.
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 44;
    doc.moveTo(left, fy - 8).lineTo(left + width, fy - 8).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    doc.text(`${co.name}  ·  Relevé ${s.monthLabel}  ·  ${s.owner.name}`, left, fy, { width: width - 60, lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, left, fy, { width, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
