/**
 * The MALODGE CLUB look of the PDF documents (owner statements, Finances exports):
 * the app's colours, the logo drawn as vectors, and the header with the company's
 * name and contacts (Paramètres › Général).
 */

export const PDF = {
  ink: '#1D1D1F',
  body: '#424245',
  muted: '#6E6E73',
  accent: '#B2502C',
  arch: '#A84A28',
  line: '#E5E5EA',
  soft: '#F5F5F7',
  peach: '#FAEEE6',
} as const;

/** The company signing a document, or its name only. */
export type DocCompany = { name: string; supportEmail?: string; phone?: string; website?: string };

/** The built-in PDF font has no narrow or no-break space (French number formatting): plain spaces. */
export const plain = (t: string) => t.replace(/[   ]/g, ' ');

/** The MALODGE CLUB symbol (riad arch, sun over the pool), drawn as vectors at `size` points. */
export function logoMark(doc: any, x: number, y: number, size: number) {
  doc.save();
  doc.translate(x, y).scale(size / 32);
  doc.path('M4.5 30V14.5C4.5 8 9.6 3.4 16 1.6 22.4 3.4 27.5 8 27.5 14.5V30ZM9.6 30V17.4c0-3.8 2.7-6.6 6.4-7.9 3.7 1.3 6.4 4.1 6.4 7.9V30Z').fill(PDF.arch, 'even-odd');
  doc.path('M12 22.6a4 4 0 0 1 8 0Z').fill(PDF.ink);
  doc.rect(9.6, 24.3, 12.8, 1.7).fill(PDF.ink);
  doc.roundedRect(12, 27.4, 8, 1.7, 0.85).fill(PDF.ink);
  doc.restore();
}

/**
 * The header of the first page: logo and wordmark on the left, the company's name and
 * contacts on the right, a thin line under. Returns the y where the content starts.
 */
export function brandHeader(doc: any, company: DocCompany | string | null | undefined, left: number, width: number, top = 44): number {
  const co: DocCompany = typeof company === 'string' ? { name: company } : company ?? { name: 'Malodge Club' };
  logoMark(doc, left, top, 30);
  doc.font('Helvetica-Bold').fontSize(14.5).fillColor(PDF.ink).text('MALODGE', left + 40, top + 3, { characterSpacing: 2.4, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7.2).fillColor(PDF.arch).text('CLUB', left + 40.5, top + 21.5, { characterSpacing: 4.6, lineBreak: false });
  const contacts = [co.supportEmail, co.phone, co.website?.replace(/^https?:\/\//, '')].filter(Boolean) as string[];
  doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF.ink).text(co.name, left, top + 2, { width, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(PDF.muted);
  (contacts.length ? contacts : ['Conciergerie de luxe']).forEach((c, i) => doc.text(c, left, top + 14 + i * 10.5, { width, align: 'right', lineBreak: false }));
  doc.moveTo(left, top + 52).lineTo(left + width, top + 52).strokeColor(PDF.line).lineWidth(0.8).stroke();
  return top + 74;
}

/** Footer of every page (needs `bufferPages: true`): a thin line, a label on the left, "page / pages" on the right. */
export function pageFooters(doc: any, label: string, left: number, width: number) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing in the bottom margin would otherwise open a new page.
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 44;
    doc.moveTo(left, fy - 8).lineTo(left + width, fy - 8).strokeColor(PDF.line).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF.muted);
    doc.text(plain(label), left, fy, { width: width - 60, lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, left, fy, { width, align: 'right', lineBreak: false });
  }
}
