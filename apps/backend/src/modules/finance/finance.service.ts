import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Response } from 'express';
import { FxService } from '../fx/fx.service';
import { DEFAULT_CURRENCY, VillaCurrencies, orderCurrency, pickCurrency, providerCost, reservationCurrency, serviceDate, serviceDateBetween, stayNightsBetween, stayRevenueBetween, totalsByCurrency } from '../../common/money';
import { change, chartBuckets, financeRange, FinancePeriod, financeReport, House, OrderIn, previousRange, rangeLabel, StayIn } from './report';
import { houseLabel } from '../../common/villa-name';
import { SettingsService } from '../settings/settings.service';
import { brandHeader, DocCompany, pageFooters, PDF, plain } from '../../common/pdf-brand';

type Period = FinancePeriod;

const STAY_COUNTED = ['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;
const DONE = ['COMPLETED', 'IN_PROGRESS'] as const;
const TO_COME = ['CONFIRMED', 'PENDING'] as const;
const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || '—';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
    @Optional() private settings?: SettingsService,
  ) {}

  /** The name the exports are signed with (Paramètres › Général). */
  private async companyName() {
    return (await this.settings?.getCompany())?.name ?? 'Malodge Club Villa';
  }

  private async villaCurrencies(): Promise<VillaCurrencies> {
    const villas = await this.prisma.villa.findMany({ select: { id: true, currency: true } });
    return new Map(villas.map((v) => [v.id, v.currency || DEFAULT_CURRENCY]));
  }

  /**
   * The Finances view of a calendar period (the one holding `ref`), next to the period before.
   * By default everything is converted to dirhams at today's rate (amounts stay stored in
   * their own currency); `currency=EUR|MAD…` shows that currency only, unconverted.
   * `countries` limits it to the villas of those countries (managers of some countries).
   */
  async getDashboard(period: Period, askedCurrency?: string, ref: Date = new Date(), countries: string[] | null = null) {
    const range = financeRange(period, ref);
    const before = previousRange(period, range);
    const today = new Date();

    const villas = await this.prisma.villa.findMany({
      where: countries?.length ? { country: { in: countries } } : {},
      select: { id: true, name: true, currency: true, parentVillaId: true },
    });
    const villaById = new Map(villas.map((v) => [v.id, v]));
    const withFormulas = new Set(villas.map((v) => v.parentVillaId).filter(Boolean));
    // A house and its Lodgify formulas count as one house (named without a formula's rooms).
    const houseOf = (villaId: string | null | undefined): House | null => {
      const v = villaId ? villaById.get(villaId) : undefined;
      if (!v) return null;
      const h = v.parentVillaId ? villaById.get(v.parentVillaId) ?? v : v;
      return { id: h.id, name: houseLabel(h.name, withFormulas.has(h.id)) };
    };
    const villaCurrency = (villaId: string | null | undefined) => (villaId && villaById.get(villaId)?.currency) || DEFAULT_CURRENCY;

    const [reservations, orders] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          status: { in: [...STAY_COUNTED] },
          ...stayNightsBetween(before.start, range.end),
          ...(countries?.length ? { villaId: { in: villas.map((v) => v.id) } } : {}),
        },
        select: { id: true, villaId: true, checkIn: true, checkOut: true, totalAmount: true, currency: true, villa: { select: { currency: true } } },
      }),
      this.prisma.order.findMany({
        where: { status: { in: [...DONE, ...TO_COME] }, ...serviceDateBetween(before.start, range.end) },
        select: {
          id: true, status: true, villaId: true, totalAmount: true, commission: true, scheduledAt: true, completedAt: true, createdAt: true,
          reservation: { select: { villaId: true } },
          provider: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          items: { select: { serviceId: true, label: true, quantity: true, total: true, unitCost: true, service: { select: { name: true, category: { select: { name: true } } } } } },
        },
      }),
    ]);

    // Orders of the villas this user sees (orders of no villa only when not limited to countries).
    const visibleOrders = orders.filter((o) => {
      const villaId = o.villaId ?? o.reservation?.villaId;
      return villaId ? villaById.has(villaId) : !countries?.length;
    });
    const orderVilla = (o: (typeof orders)[number]) => o.villaId ?? o.reservation?.villaId ?? null;

    // Every currency with money in the period, largest first.
    const currencies = totalsByCurrency(
      [
        ...visibleOrders.filter((o) => (DONE as readonly string[]).includes(o.status) && serviceDate(o) >= range.start && serviceDate(o) <= range.end).map((o) => ({ c: villaCurrency(orderVilla(o)), a: o.totalAmount })),
        ...reservations.map((r) => ({ c: reservationCurrency(r), a: stayRevenueBetween(r, range.start, range.end) })),
      ].filter((x) => x.a),
      (x) => x.c,
      (x) => x.a,
    );

    const converted = !askedCurrency || askedCurrency.toUpperCase() === 'ALL';
    const q = converted ? await this.fx.quote() : null;
    const currency = converted ? 'MAD' : pickCurrency(currencies, askedCurrency);
    const notConverted = new Set<string>();
    /** Factor to the report currency, null when the row is left out. */
    const factor = (c: string): number | null => {
      if (!converted) return c === currency ? 1 : null;
      const f = this.fx.rateOf(q, c, 'MAD');
      if (f == null) notConverted.add(c);
      return f;
    };

    const stays: StayIn[] = [];
    for (const r of reservations) {
      const f = factor(reservationCurrency(r));
      const house = houseOf(r.villaId);
      if (f == null || !house || !r.checkIn || !r.checkOut) continue;
      stays.push({ id: r.id, house, checkIn: r.checkIn, checkOut: r.checkOut, amount: (r.totalAmount || 0) * f });
    }
    const toOrder = (o: (typeof orders)[number], f: number): OrderIn => ({
      id: o.id,
      house: houseOf(orderVilla(o)),
      date: serviceDate(o),
      totalAmount: o.totalAmount * f,
      items: o.items.map((i) => ({
        key: i.serviceId ?? `label:${(i.label ?? 'Autre').trim().toLowerCase()}`,
        name: i.service?.name ?? i.label ?? 'Prestation hors catalogue',
        category: i.service?.category?.name ?? null,
        quantity: i.quantity,
        total: i.total * f,
        cost: i.unitCost != null ? i.quantity * i.unitCost * f : null,
      })),
    });
    const done: OrderIn[] = [];
    const toCome: (OrderIn & { status: string })[] = [];
    const providers = new Map<string, { providerId: string; name: string; amount: number; count: number }>();
    for (const o of visibleOrders) {
      const f = factor(villaCurrency(orderVilla(o)));
      if (f == null) continue;
      const row = toOrder(o, f);
      if ((DONE as readonly string[]).includes(o.status)) {
        done.push(row);
        // What each provider is owed for the period (export).
        const d = serviceDate(o);
        if (o.provider && d >= range.start && d <= range.end) {
          const p = providers.get(o.provider.id) ?? { providerId: o.provider.id, name: fullName(o.provider.user), amount: 0, count: 0 };
          p.amount += providerCost(o) * f;
          p.count += 1;
          providers.set(o.provider.id, p);
        }
      } else toCome.push({ ...row, status: o.status });
    }

    const report = financeReport(stays, done, range, today, chartBuckets(period, range));
    const previous = financeReport(stays, done, before, today, []).totals;

    // Extras of the period not realised yet: to come, to confirm, and those past but never closed.
    const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const pipe = (list: typeof toCome) => ({ count: list.length, amount: r2(list.reduce((s, o) => s + (o.items.length ? o.items.reduce((x, i) => x + i.total, 0) : o.totalAmount), 0)) });
    const inPeriod = toCome.filter((o) => o.date >= range.start && o.date <= range.end);
    const pipeline = {
      confirmed: pipe(inPeriod.filter((o) => o.status === 'CONFIRMED' && o.date >= startOfToday)),
      toConfirm: pipe(inPeriod.filter((o) => o.status === 'PENDING' && o.date >= startOfToday)),
      /** Dated before today but still "à confirmer" or "confirmée": not in the revenue until closed. */
      overdue: pipe(inPeriod.filter((o) => o.date < startOfToday)),
    };

    const t = report.totals;
    const providerPayouts = [...providers.values()].map((p) => ({ ...p, amount: r2(p.amount) })).sort((a, b) => b.amount - a.amount);
    return {
      period,
      range: { start: iso(range.start), end: iso(range.end), label: rangeLabel(period, range) },
      previousRange: { start: iso(before.start), end: iso(before.end), label: rangeLabel(period, before) },
      today: iso(today),
      currency,
      /** True when every currency was converted to MAD at today's rate. */
      converted,
      fx: q ? { rate: this.fx.rateOf(q, 'EUR', 'MAD'), date: q.date, source: q.source, stale: !!q.stale } : null,
      notConverted: [...notConverted],
      /** Every currency with money in the period, largest first: switch with `currency`. */
      currencies,
      totals: t,
      previous,
      changes: {
        revenue: change(t.revenue, previous.revenue),
        accommodation: change(t.accommodation, previous.accommodation),
        extras: change(t.extras, previous.extras),
        extrasMargin: change(t.extrasMargin, previous.extrasMargin),
      },
      series: report.series,
      byHouse: report.byHouse,
      byActivity: report.byActivity,
      pipeline,
      providerPayouts,
    };
  }

  async getProviderPayouts(month: number, year: number, convert = true) {
    const q = convert ? await this.fx.quote() : null;
    const villaCur = await this.villaCurrencies();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        ...serviceDateBetween(start, end),
        providerId: { not: null },
      },
      include: {
        items: { select: { quantity: true, unitCost: true } },
        provider: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        payment: true,
      },
    });

    const payoutMap = new Map<string, {
      providerId: string;
      currency: string;
      name: string;
      email: string;
      grossAmount: number;
      commission: number;
      netAmount: number;
      orderCount: number;
    }>();

    for (const order of orders) {
      if (!order.provider) continue;
      const providerId = order.provider.id;
      const name = `${order.provider.user.firstName} ${order.provider.user.lastName}`;
      const email = order.provider.user.email;
      // One line per provider and currency, or per provider in dirhams once converted.
      const own = orderCurrency(villaCur, order);
      const f = convert ? this.fx.rateOf(q, own, 'MAD') : 1;
      if (f == null) continue;
      const currency = convert ? 'MAD' : own;
      const key = `${providerId}|${currency}`;
      const existing = payoutMap.get(key) || {
        providerId,
        currency,
        name,
        email,
        grossAmount: 0,
        commission: 0,
        netAmount: 0,
        orderCount: 0,
      };
      existing.grossAmount += order.totalAmount * f;
      // The provider is owed its cost when the extra has one, else the total minus commission.
      const owed = providerCost(order) * f;
      existing.commission += order.totalAmount * f - owed;
      existing.netAmount += owed;
      existing.orderCount += 1;
      payoutMap.set(key, existing);
    }

    return Array.from(payoutMap.values()).sort((a, b) => b.netAmount - a.netAmount);
  }

  async getOwnerPayouts(month: number, year: number, convert = true) {
    const q = convert ? await this.fx.quote() : null;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: 'COMPLETED',
        checkOut: { gte: start, lte: end },
      },
      include: {
        villa: {
          select: {
            id: true,
            name: true,
            currency: true,
            managementFeeRate: true,
            owner: { select: { firstName: true, lastName: true } },
            formulas: { select: { id: true }, take: 1 },
            // A formula is paid out with its house: the house's name, owner and rate.
            parentVilla: { select: { id: true, name: true, managementFeeRate: true, owner: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    const payoutMap = new Map<string, {
      villaId: string;
      currency: string;
      name: string;
      ownerName: string;
      grossAmount: number;
      managementFee: number;
      netAmount: number;
      stayCount: number;
    }>();

    for (const res of reservations) {
      const house = res.villa.parentVilla ?? res.villa;
      const villaId = house.id;
      const owner = res.villa.parentVilla ? res.villa.parentVilla.owner : res.villa.owner;
      const own = reservationCurrency(res);
      const f = convert ? this.fx.rateOf(q, own, 'MAD') : 1;
      if (f == null) continue;
      const currency = convert ? 'MAD' : own;
      const key = `${villaId}|${currency}`;
      const existing = payoutMap.get(key) || {
        villaId,
        currency,
        name: houseLabel(house.name, !!res.villa.parentVilla || res.villa.formulas.length > 0),
        ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'Non assigné',
        grossAmount: 0,
        managementFee: 0,
        netAmount: 0,
        stayCount: 0,
      };
      const amount = res.totalAmount * f;
      const fee = amount * house.managementFeeRate;
      existing.grossAmount += amount;
      existing.managementFee += fee;
      existing.netAmount += amount - fee;
      existing.stayCount += 1;
      payoutMap.set(key, existing);
    }

    return Array.from(payoutMap.values()).sort((a, b) => b.netAmount - a.netAmount);
  }

  async exportReport(period: string, format: 'pdf' | 'excel' | 'csv', res: Response, currency?: string, ref: Date = new Date(), countries: string[] | null = null) {
    const validPeriod = (['day', 'week', 'month', 'year'].includes(period) ? period : 'month') as Period;
    const data = await this.getDashboard(validPeriod, currency, ref, countries);
    const filename = `rapport-finances-${data.range.start}-${validPeriod}-${data.currency}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      // BOM: Excel opens the accents correctly.
      res.send(Buffer.from('﻿' + this.generateCsv(data), 'utf-8'));
    } else if (format === 'excel') {
      const buffer = await this.generateExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
    } else {
      const buffer = await this.generatePdf(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      res.send(buffer);
    }
  }

  /** The figures of the report, as rows (shared by the three formats). */
  private exportSections(data: Awaited<ReturnType<FinanceService['getDashboard']>>) {
    const t = data.totals;
    const note = data.converted
      ? `Montants en MAD, convertis au taux du ${data.fx?.date ?? '—'} (1 EUR = ${data.fx?.rate ?? '—'} MAD)`
      : `Montants en ${data.currency} seulement, non convertis`;
    return {
      title: `Finances — ${data.range.label}`,
      note,
      summary: [
        ['Chiffre d’affaires (hébergement + extras)', t.revenue],
        ['  dont hébergement', t.accommodation],
        ['    dont nuits à venir', t.accommodationUpcoming],
        ['  dont extras réalisés', t.extras],
        ['Coût des extras (coût connu)', t.extrasCost],
        ['Marge des extras', t.extrasMargin],
        ['Extras sans coût (hors marge)', t.extrasNoCost],
        ['Nuits', t.nights],
        ['Séjours', t.stays],
        ['Extras réalisés (nombre)', t.extrasCount],
        [`Période précédente (${data.previousRange.label}) : chiffre d’affaires`, data.previous.revenue],
      ] as [string, number][],
      houses: data.byHouse.map((h) => [h.name, h.accommodation, h.extras, h.revenue, h.nights, h.extrasCount] as [string, number, number, number, number, number]),
      activities: data.byActivity.map((a) => [a.name, a.category ?? '', a.count, a.revenue, a.costKnown ? a.margin : null] as [string, string, number, number, number | null]),
      providers: data.providerPayouts.map((p) => [p.name, p.count, p.amount] as [string, number, number]),
    };
  }

  private generateCsv(data: Awaited<ReturnType<FinanceService['getDashboard']>>): string {
    const x = this.exportSections(data);
    const cell = (v: unknown) => (v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`);
    const row = (...v: unknown[]) => v.map(cell).join(';');
    const lines = [row(x.title), row(x.note), '', row('RÉSUMÉ'), ...x.summary.map(([k, v]) => row(k, v)), ''];
    lines.push(row('PAR VILLA'), row('Villa', 'Hébergement', 'Extras', 'Total', 'Nuits', 'Extras (nombre)'), ...x.houses.map((h) => row(...h)), row('Total', data.totals.accommodation, data.totals.extras, data.totals.revenue, data.totals.nights, data.totals.extrasCount), '');
    lines.push(row('PAR ACTIVITÉ (extras)'), row('Activité', 'Catégorie', 'Nombre', 'CA', 'Marge'), ...x.activities.map((a) => row(...a)), '');
    lines.push(row('DÛ AUX PRESTATAIRES'), row('Prestataire', 'Extras', 'Montant'), ...x.providers.map((p) => row(...p)));
    return lines.join('\r\n');
  }

  private async generateExcel(data: Awaited<ReturnType<FinanceService['getDashboard']>>): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const x = this.exportSections(data);
    const wb = new ExcelJS.Workbook();
    wb.creator = await this.companyName();
    wb.created = new Date();
    const money = '#,##0.00';
    const sheet = (name: string, header: string[], rows: unknown[][], moneyCols: number[], widths: number[]) => {
      const ws = wb.addWorksheet(name);
      ws.addRow([x.title]).font = { bold: true, size: 13 };
      ws.addRow([x.note]).font = { italic: true, color: { argb: 'FF666666' } };
      ws.addRow([]);
      ws.addRow(header).font = { bold: true };
      for (const r of rows) ws.addRow(r);
      moneyCols.forEach((c) => (ws.getColumn(c).numFmt = money));
      widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
      return ws;
    };
    sheet('Résumé', ['Indicateur', `Valeur (${data.currency})`], x.summary, [2], [52, 18]);
    const houses = sheet('Par villa', ['Villa', 'Hébergement', 'Extras', 'Total', 'Nuits', 'Extras (nombre)'], x.houses, [2, 3, 4], [34, 16, 16, 16, 10, 16]);
    houses.addRow(['Total', data.totals.accommodation, data.totals.extras, data.totals.revenue, data.totals.nights, data.totals.extrasCount]).font = { bold: true };
    sheet('Par activité', ['Activité', 'Catégorie', 'Nombre', 'CA', 'Marge'], x.activities, [4, 5], [34, 20, 10, 16, 16]);
    sheet('Prestataires', ['Prestataire', 'Extras', 'Montant dû'], x.providers, [3], [30, 10, 16]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Who signs the exports: the company of Paramètres › Général once set (name and contacts). */
  private async companyForDocs(): Promise<DocCompany> {
    const c = await this.settings?.getCompany();
    return c?.saved ? { name: c.name, supportEmail: c.supportEmail, phone: c.phone, website: c.website } : { name: c?.name ?? 'Malodge Club Villa' };
  }

  private async generatePdf(data: Awaited<ReturnType<FinanceService['getDashboard']>>): Promise<Buffer> {
    const pdfkit: any = await import('pdfkit');
    const PDFDocument = pdfkit.default ?? pdfkit; // CommonJS module: no default export once compiled
    const x = this.exportSections(data);
    const company = await this.companyForDocs();
    const money = (n: number | null) =>
      n == null ? '—' : plain(`${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${data.currency === 'EUR' ? '€' : data.currency}`);
    const t = data.totals;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true, info: { Title: x.title, Author: company.name } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = 48;
      const width = doc.page.width - 96;
      const bottom = doc.page.height - 70;
      const ensure = (h: number) => {
        if (doc.y + h > bottom) doc.addPage();
      };

      /* Header and title */
      const top = brandHeader(doc, company, left, width);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF.accent).text('EXPORT FINANCES', left, top + 4, { characterSpacing: 1.4 });
      doc.font('Helvetica-Bold').fontSize(22).fillColor(PDF.ink).text(plain(data.range.label.charAt(0).toUpperCase() + data.range.label.slice(1)), left, top + 18, { width });
      doc.font('Helvetica').fontSize(9.5).fillColor(PDF.muted).text(plain(`${x.note}  ·  édité le ${new Date().toLocaleDateString('fr-FR')}`), left, doc.y + 2, { width });

      /* Key figures */
      const cardsTop = doc.y + 16;
      const gap = 10;
      const cw = (width - 2 * gap) / 3;
      const cards: [string, string, boolean][] = [
        ['Chiffre d’affaires', money(t.revenue), true],
        ['Hébergement', money(t.accommodation), false],
        ['Extras réalisés', money(t.extras), false],
      ];
      cards.forEach(([label, value, strong], i) => {
        const cx = left + i * (cw + gap);
        doc.roundedRect(cx, cardsTop, cw, 62, 12).fill(strong ? PDF.accent : PDF.soft);
        doc.font('Helvetica').fontSize(8.5).fillColor(strong ? '#FFFFFF' : PDF.muted).text(label, cx + 14, cardsTop + 13, { width: cw - 28, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(15).fillColor(strong ? '#FFFFFF' : PDF.ink).text(value, cx + 14, cardsTop + 31, { width: cw - 28, lineBreak: false });
      });
      doc.y = cardsTop + 62 + 10;
      doc.x = left;

      /** A section title and its table: header band, thin separators, numbers on the right, a total row. */
      const table = (title: string, header: string[], rows: (string | number | null)[][], cols: number[], moneyCols: number[], totalRow?: (string | number | null)[], accentCol = cols.length - 1) => {
        ensure(90);
        const y0 = doc.y + 14;
        doc.roundedRect(left, y0 + 1, 3, 13, 1.5).fill(PDF.accent);
        doc.font('Helvetica-Bold').fontSize(12.5).fillColor(PDF.ink).text(title, left + 11, y0, { width: width - 11 });
        doc.y += 8;
        const xs = cols.reduce<number[]>((a, w, i) => [...a, i ? a[i - 1] + cols[i - 1] : left], []);
        const rowH = 20;
        const cellText = (c: string | number | null, i: number) => (typeof c === 'number' || c == null ? (moneyCols.includes(i) ? money(c as number | null) : String(c ?? '')) : plain(c));
        const head = () => {
          const y = doc.y;
          doc.roundedRect(left, y, width, rowH, 6).fill(PDF.soft);
          header.forEach((h, i) =>
            doc.font('Helvetica-Bold').fontSize(7.2).fillColor(PDF.muted).text(h.toUpperCase(), xs[i] + 6, y + 7, { width: cols[i] - 12, align: i ? 'right' : 'left', lineBreak: false, characterSpacing: 0.4 }),
          );
          doc.y = y + rowH + 2;
        };
        head();
        const line = (cells: (string | number | null)[], total = false) => {
          if (doc.y + rowH > bottom) {
            doc.addPage();
            head();
          }
          const y = doc.y;
          if (total) doc.moveTo(left, y).lineTo(left + width, y).strokeColor(PDF.ink).lineWidth(0.6).stroke();
          cells.forEach((c, i) => {
            // Sub-lines of the summary ("dont …") are indented as in the screen.
            const indent = i === 0 && typeof c === 'string' ? (c.match(/^ */)?.[0].length ?? 0) * 5 : 0;
            doc.font(total ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8).fillColor(total ? (i === accentCol ? PDF.accent : PDF.ink) : indent ? PDF.muted : PDF.body)
              .text(cellText(typeof c === 'string' ? c.trim() : c, i), xs[i] + 6 + indent, y + 6, { width: cols[i] - 12 - indent, align: i ? 'right' : 'left', lineBreak: false, ellipsis: true, height: 11 });
          });
          if (!total) doc.moveTo(left + 8, y + rowH).lineTo(left + width - 8, y + rowH).strokeColor(PDF.line).lineWidth(0.5).stroke();
          doc.y = y + rowH;
        };
        rows.forEach((r) => line(r));
        if (totalRow) line(totalRow, true);
        doc.x = left;
      };

      // Counts are not amounts.
      table('Résumé', ['Indicateur', 'Montant'], x.summary.map(([k, v]) => [k, ['Nuits', 'Séjours', 'Extras réalisés (nombre)'].includes(k) ? String(v) : v]), [width - 140, 140], [1]);
      table('Par villa', ['Villa', 'Hébergement', 'Extras', 'Total', 'Nuits'], x.houses.map((h) => h.slice(0, 5) as (string | number)[]), [width - 330, 95, 85, 95, 55], [1, 2, 3], ['Total', t.accommodation, t.extras, t.revenue, t.nights], 3);
      if (x.activities.length) table('Extras par activité', ['Activité', 'Nombre', 'CA', 'Marge'], x.activities.slice(0, 30).map((a) => [a[0], a[2], a[3], a[4]]), [width - 275, 60, 110, 105], [2, 3]);
      if (x.providers.length) table('Dû aux prestataires', ['Prestataire', 'Extras', 'Montant'], x.providers, [width - 190, 60, 130], [2]);

      pageFooters(doc, `${company.name}  ·  ${x.title}`, left, width);
      doc.end();
    });
  }
}
