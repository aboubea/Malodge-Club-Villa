import type { StatementData } from './statement';

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

const INK = '#1C1D29';
const MUTED = '#6B6E80';
const ACCENT = '#B8512F';
const LINE = '#E4E1DC';
const SOFT = '#F7F4F1';

interface Column {
  title: string;
  width: number;
  align?: 'left' | 'right';
}

/** The statement as a PDF (A4), in French. */
export async function statementPdf(s: StatementData): Promise<Buffer> {
  const pdfkit: any = await import('pdfkit');
  const PDFDocument = pdfkit.default ?? pdfkit; // CommonJS module: no default export once compiled
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Relevé ${s.monthLabel} — ${s.owner.name}`, Author: 'Malodge Club' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = 48;
  const width = doc.page.width - 96;
  const bottom = doc.page.height - 64;
  const ensure = (h: number) => {
    if (doc.y + h > bottom) doc.addPage();
  };

  const table = (columns: Column[], rows: string[][], opts: { bold?: number[] } = {}) => {
    const rowH = 18;
    const header = () => {
      // Every title on the same line (writing a text moves the cursor down).
      const y = doc.y;
      let x = left;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
      columns.forEach((c) => {
        doc.text(c.title.toUpperCase(), x + 4, y, { width: c.width - 8, align: c.align ?? 'left', lineBreak: false });
        x += c.width;
      });
      doc.moveTo(left, y + 14).lineTo(left + width, y + 14).strokeColor(LINE).lineWidth(0.8).stroke();
      doc.y = y + 16;
    };
    ensure(rowH * 2 + 10);
    header();
    rows.forEach((row, i) => {
      if (doc.y + rowH > bottom) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      let x = left;
      doc.font(opts.bold?.includes(i) ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(INK);
      row.forEach((cell, j) => {
        const c = columns[j];
        doc.text(cell, x + 4, y + 4, { width: c.width - 8, align: c.align ?? 'left', lineBreak: false, ellipsis: true, height: 11 });
        x += c.width;
      });
      doc.moveTo(left, y + rowH).lineTo(left + width, y + rowH).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.y = y + rowH;
    });
    doc.x = left;
    doc.moveDown(0.8);
  };

  // A section title stays with the start of its table.
  const title = (text: string, sub?: string) => {
    ensure(110);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(text, left, doc.y);
    if (sub) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(sub);
    doc.moveDown(0.5);
  };

  // Header
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('MALODGE', left, 48, { continued: true, characterSpacing: 2 }).fillColor(ACCENT).text(' CLUB', { characterSpacing: 2 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Conciergerie de villas', left, doc.y);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(`Relevé propriétaire — ${cap(s.monthLabel)}`, left, 110);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${s.owner.name} · du ${frDate(s.period.start)} au ${frDate(s.period.end)}`);
  doc.moveDown(1);

  // Summary
  const t = s.totals;
  const lines: [string, string, boolean?][] = [
    ['Nuits louées dans le mois', String(t.nights)],
    ['CA hébergement du mois', amount(t.gross, 'MAD')],
    ['Commission de gestion', amount(-t.fee, 'MAD')],
    ['Net hébergement', amount(t.net, 'MAD'), true],
    ['Votre part sur les extras', amount(t.extras, 'MAD')],
    ['Total dû pour le mois', amount(t.due, 'MAD'), true],
    ['Déjà versé ce mois-ci', amount(-t.paid, 'MAD')],
    ['Reste à verser', amount(t.remaining, 'MAD'), true],
  ];
  const boxTop = doc.y;
  const boxH = lines.length * 17 + 16;
  doc.roundedRect(left, boxTop, width, boxH, 8).fill(SOFT);
  lines.forEach(([label, value, strong], i) => {
    const y = boxTop + 10 + i * 17;
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(strong ? INK : '#3A3C4E');
    doc.text(label, left + 14, y, { width: width / 2, lineBreak: false });
    doc.text(value, left + width / 2, y, { width: width / 2 - 14, align: 'right', lineBreak: false });
  });
  doc.y = boxTop + boxH + 18;
  doc.x = left;

  // Accommodation per house
  for (const h of s.houses) {
    title(h.name, `Commission de gestion : ${amount(h.feeRate * 100)} % · ${h.nights} nuit(s) dans le mois`);
    if (!h.stays.length) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Aucun séjour ce mois-ci.');
      doc.moveDown(0.8);
      continue;
    }
    table(
      [
        { title: 'Client', width: 150 },
        { title: 'Arrivée', width: 62 },
        { title: 'Départ', width: 62 },
        { title: 'Nuits', width: 52, align: 'right' },
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
        [`Commission ${amount(h.feeRate * 100)} %`, '', '', '', '', amount(-h.fee, 'MAD')],
        ['Net hébergement', '', '', '', '', amount(h.net, 'MAD')],
      ],
      { bold: [h.stays.length + 2] },
    );
  }

  // Extras
  title('Extras du mois', 'Votre part sur la marge des extras réalisés dans vos villas');
  if (!s.extras.length) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Aucun extra ce mois-ci.');
    doc.moveDown(0.8);
  } else {
    // Older statements (before the price and the reason were kept) still print.
    const why = (e: (typeof s.extras)[number]) => ('reason' in e && e.reason ? String(e.reason) : 'à compléter');
    table(
      [
        { title: 'Date', width: 58 },
        { title: 'Prestation', width: 150 },
        { title: 'Séjour', width: 100 },
        { title: 'Prix', width: 70, align: 'right' },
        { title: 'Votre part', width: width - 378 - 64, align: 'right' },
        { title: 'En MAD', width: 64, align: 'right' },
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
        ['Total', '', '', '', '', amount(t.extras, 'MAD')],
      ],
      { bold: [s.extras.length] },
    );
  }

  // Payments
  if (s.payments.length) {
    title('Versements du mois');
    table(
      [
        { title: 'Date', width: 70 },
        { title: 'Type', width: 170 },
        { title: 'Référence', width: 140 },
        { title: 'Montant', width: width - 380, align: 'right' },
      ],
      s.payments.map((p) => [frDate(p.date), p.kind === 'OWNER_PAYOUT' ? 'Versement au propriétaire' : 'Reçu du propriétaire', p.reference ?? '—', amount(p.amountMad, 'MAD')]),
    );
  }

  // Notes
  ensure(70);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  const notes = [
    'Chaque séjour compte pour ses nuits du mois (arrivée incluse, départ exclu) ; un séjour à cheval sur deux mois est réparti au prorata des nuits.',
    s.fx.eurToMad ? `Montants en euros convertis au taux du ${frDate(s.fx.date)} : 1 € = ${amount(s.fx.eurToMad)} MAD.` : null,
    ...s.warnings,
  ].filter(Boolean) as string[];
  notes.forEach((n) => doc.text(`• ${n}`, left, doc.y, { width }));

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing in the bottom margin would otherwise open a new page.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`Malodge Club · Relevé ${s.monthLabel} · ${s.owner.name} · page ${i + 1}/${range.count}`, left, doc.page.height - 40, { width, align: 'center', lineBreak: false });
  }

  doc.end();
  return done;
}
