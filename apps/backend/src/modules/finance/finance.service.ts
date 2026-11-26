import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Response } from 'express';
import { DEFAULT_CURRENCY, VillaCurrencies, orderCurrency, pickCurrency, providerCost, reservationCurrency, serviceDate, serviceDateBetween, totalsByCurrency } from '../../common/money';

type Period = 'day' | 'week' | 'month' | 'year';

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  let start: Date;

  switch (period) {
    case 'day':
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
  }

  return { start, end };
}

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async villaCurrencies(): Promise<VillaCurrencies> {
    const villas = await this.prisma.villa.findMany({ select: { id: true, currency: true } });
    return new Map(villas.map((v) => [v.id, v.currency || DEFAULT_CURRENCY]));
  }

  /**
   * Figures of one currency only (amounts in MAD and in EUR are never added):
   * `currency` picks it, by default the one with the most revenue in the period.
   */
  async getDashboard(period: Period, askedCurrency?: string) {
    const { start, end } = getPeriodRange(period);
    const villaCur = await this.villaCurrencies();

    // Revenue is dated by the day the service is done, not the day it was keyed in.
    const allOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
        ...serviceDateBetween(start, end),
      },
      include: {
        items: { include: { service: { include: { category: true } } } },
        reservation: { include: { villa: { select: { id: true, name: true } } } },
        provider: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        payment: true,
      },
    });

    // Accommodation revenue (from reservations in the same period)
    const allReservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['ACTIVE', 'COMPLETED'] },
        createdAt: { gte: start, lte: end },
      },
      include: { villa: { select: { currency: true } } },
    });

    const currencies = totalsByCurrency(
      [
        ...allOrders.map((o) => ({ c: orderCurrency(villaCur, o), a: o.totalAmount })),
        ...allReservations.map((r) => ({ c: reservationCurrency(r), a: r.totalAmount })),
      ],
      (x) => x.c,
      (x) => x.a,
    );
    const currency = pickCurrency(currencies, askedCurrency);
    const completedOrders = allOrders.filter((o) => orderCurrency(villaCur, o) === currency);
    const reservations = allReservations.filter((r) => reservationCurrency(r) === currency);

    // Total revenue
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCommissions = completedOrders.reduce((sum, o) => sum + o.commission, 0);

    // Service revenue (from order items)
    const serviceRevenue = completedOrders.reduce((sum, o) =>
      sum + o.items.reduce((s, i) => s + i.total, 0), 0);

    const accommodationRevenue = reservations.reduce((sum, r) => sum + r.totalAmount, 0);

    // Concierge margin
    // Margin = what the client pays minus what the provider is owed (its cost when
    // known, as in the extras tracking), before the owner's and seller's shares.
    const conciergeMargin = completedOrders.reduce((sum, o) => sum + (o.totalAmount - providerCost(o)), 0);

    // Revenue by day
    const revenueByDayMap = new Map<string, number>();
    for (const order of completedOrders) {
      const day = serviceDate(order).toISOString().split('T')[0];
      revenueByDayMap.set(day, (revenueByDayMap.get(day) || 0) + order.totalAmount);
    }
    const revenueByDay = Array.from(revenueByDayMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by villa
    const revenueByVillaMap = new Map<string, { villaId: string; name: string; amount: number }>();
    for (const order of completedOrders) {
      if (order.reservation?.villa) {
        const { id: villaId, name } = order.reservation.villa;
        const existing = revenueByVillaMap.get(villaId) || { villaId, name, amount: 0 };
        existing.amount += order.totalAmount;
        revenueByVillaMap.set(villaId, existing);
      }
    }
    const revenueByVilla = Array.from(revenueByVillaMap.values())
      .sort((a, b) => b.amount - a.amount);

    // Revenue by service
    const revenueByServiceMap = new Map<string, { serviceId: string; name: string; amount: number }>();
    for (const order of completedOrders) {
      for (const item of order.items) {
        // Off-catalogue extras have no service: group them by their free-text label.
        const key = item.serviceId ?? `label:${item.label ?? 'Autre'}`;
        const existing = revenueByServiceMap.get(key) || {
          serviceId: item.serviceId ?? key,
          name: item.service?.name ?? item.label ?? 'Prestation hors catalogue',
          amount: 0,
        };
        existing.amount += item.total;
        revenueByServiceMap.set(key, existing);
      }
    }
    const revenueByService = Array.from(revenueByServiceMap.values())
      .sort((a, b) => b.amount - a.amount);

    // Provider payouts
    const providerPayoutMap = new Map<string, { providerId: string; name: string; amount: number }>();
    for (const order of completedOrders) {
      if (order.provider) {
        const { id: providerId } = order.provider;
        const name = `${order.provider.user.firstName} ${order.provider.user.lastName}`;
        const netAmount = providerCost(order);
        const existing = providerPayoutMap.get(providerId) || { providerId, name, amount: 0 };
        existing.amount += netAmount;
        providerPayoutMap.set(providerId, existing);
      }
    }
    const providerPayouts = Array.from(providerPayoutMap.values()).sort((a, b) => b.amount - a.amount);

    // Owner payouts (from reservations)
    const ownerPayouts: { villaId: string; name: string; amount: number }[] = [];

    // Top performers
    const topPerformers = [
      ...revenueByVilla.slice(0, 3).map((v) => ({ type: 'villa' as const, name: v.name, revenue: v.amount })),
      ...revenueByService.slice(0, 3).map((s) => ({ type: 'service' as const, name: s.name, revenue: s.amount })),
    ].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      currency,
      /** Every currency with money in the period, largest first: switch with `currency`. */
      currencies,
      totalRevenue,
      serviceRevenue,
      accommodationRevenue,
      totalCommissions,
      conciergeMargin,
      providerPayouts,
      ownerPayouts,
      revenueByDay,
      revenueByVilla,
      revenueByService,
      topPerformers,
    };
  }

  async getProviderPayouts(month: number, year: number) {
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
      // One line per provider and currency: MAD and EUR are never added together.
      const currency = orderCurrency(villaCur, order);
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
      existing.grossAmount += order.totalAmount;
      // The provider is owed its cost when the extra has one, else the total minus commission.
      const owed = providerCost(order);
      existing.commission += order.totalAmount - owed;
      existing.netAmount += owed;
      existing.orderCount += 1;
      payoutMap.set(key, existing);
    }

    return Array.from(payoutMap.values()).sort((a, b) => b.netAmount - a.netAmount);
  }

  async getOwnerPayouts(month: number, year: number) {
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
            managers: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
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

    const MANAGEMENT_FEE_RATE = 0.20; // 20% management fee

    for (const res of reservations) {
      const villaId = res.villa.id;
      const currency = reservationCurrency(res);
      const key = `${villaId}|${currency}`;
      const existing = payoutMap.get(key) || {
        villaId,
        currency,
        name: res.villa.name,
        ownerName: res.villa.managers[0]
          ? `${res.villa.managers[0].user.firstName} ${res.villa.managers[0].user.lastName}`
          : 'Non assigné',
        grossAmount: 0,
        managementFee: 0,
        netAmount: 0,
        stayCount: 0,
      };
      const fee = res.totalAmount * MANAGEMENT_FEE_RATE;
      existing.grossAmount += res.totalAmount;
      existing.managementFee += fee;
      existing.netAmount += res.totalAmount - fee;
      existing.stayCount += 1;
      payoutMap.set(key, existing);
    }

    return Array.from(payoutMap.values()).sort((a, b) => b.netAmount - a.netAmount);
  }

  async exportReport(period: string, format: 'pdf' | 'excel' | 'csv', res: Response, currency?: string) {
    const validPeriod = (['day', 'week', 'month', 'year'].includes(period) ? period : 'month') as Period;
    const data = await this.getDashboard(validPeriod, currency);
    const now = new Date();
    const filename = `rapport-finances-${period}-${data.currency}-${now.toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csv = this.generateCsv(data, period);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(Buffer.from(csv, 'utf-8'));
    } else if (format === 'excel') {
      const buffer = await this.generateExcel(data, period);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
    } else {
      const buffer = await this.generatePdf(data, period);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      res.send(buffer);
    }
  }

  private generateCsv(data: any, period: string): string {
    const lines: string[] = [];
    lines.push(`Rapport Finances - Période: ${period}`);
    lines.push(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`);
    lines.push(`Devise: ${data.currency} (montants non convertis${data.currencies?.length > 1 ? `, autres devises : ${data.currencies.filter((c: any) => c.currency !== data.currency).map((c: any) => c.currency).join(', ')}` : ''})`);
    lines.push('');
    lines.push('RÉSUMÉ');
    lines.push(`CA Total,${data.totalRevenue}`);
    lines.push(`CA Services,${data.serviceRevenue}`);
    lines.push(`CA Hébergement,${data.accommodationRevenue}`);
    lines.push(`Commissions totales,${data.totalCommissions}`);
    lines.push(`Marge conciergerie,${data.conciergeMargin}`);
    lines.push('');
    lines.push('CA PAR VILLA');
    lines.push('Villa,Montant');
    for (const v of data.revenueByVilla) {
      lines.push(`${v.name},${v.amount}`);
    }
    lines.push('');
    lines.push('CA PAR SERVICE');
    lines.push('Service,Montant');
    for (const s of data.revenueByService) {
      lines.push(`${s.name},${s.amount}`);
    }
    lines.push('');
    lines.push('REVERSEMENTS PRESTATAIRES');
    lines.push('Prestataire,Montant');
    for (const p of data.providerPayouts) {
      lines.push(`${p.name},${p.amount}`);
    }
    return lines.join('\n');
  }

  private async generateExcel(data: any, period: string): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Malodge Club Villa';
    workbook.created = new Date();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Résumé');
    summarySheet.addRow(['Rapport Finances', `Période: ${period}`]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Indicateur', `Valeur (${data.currency})`]);
    summarySheet.addRow(['CA Total', data.totalRevenue]);
    summarySheet.addRow(['CA Services', data.serviceRevenue]);
    summarySheet.addRow(['CA Hébergement', data.accommodationRevenue]);
    summarySheet.addRow(['Commissions totales', data.totalCommissions]);
    summarySheet.addRow(['Marge conciergerie', data.conciergeMargin]);

    // Villa sheet
    const villaSheet = workbook.addWorksheet('CA par Villa');
    villaSheet.addRow(['Villa', `Montant (${data.currency})`]);
    for (const v of data.revenueByVilla) {
      villaSheet.addRow([v.name, v.amount]);
    }

    // Service sheet
    const serviceSheet = workbook.addWorksheet('CA par Service');
    serviceSheet.addRow(['Service', `Montant (${data.currency})`]);
    for (const s of data.revenueByService) {
      serviceSheet.addRow([s.name, s.amount]);
    }

    // Provider payouts sheet
    const providerSheet = workbook.addWorksheet('Reversements Prestataires');
    providerSheet.addRow(['Prestataire', `Montant net (${data.currency})`]);
    for (const p of data.providerPayouts) {
      providerSheet.addRow([p.name, p.amount]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async generatePdf(data: any, period: string): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(22).fillColor('#C9A96E').text('Malodge Club Villa', { align: 'center' });
      doc.fontSize(14).fillColor('#333').text(`Rapport Finances — ${period}`, { align: 'center' });
      doc.fontSize(10).fillColor('#666').text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
      doc.moveDown(2);

      // KPIs
      doc.fontSize(14).fillColor('#C9A96E').text('Indicateurs Clés', { underline: false });
      doc.moveDown(0.5);

      const kpis = [
        ['CA Total', `${data.totalRevenue.toLocaleString('fr-FR')} ${data.currency}`],
        ['CA Services', `${data.serviceRevenue.toLocaleString('fr-FR')} ${data.currency}`],
        ['CA Hébergement', `${data.accommodationRevenue.toLocaleString('fr-FR')} ${data.currency}`],
        ['Commissions totales', `${data.totalCommissions.toLocaleString('fr-FR')} ${data.currency}`],
        ['Marge conciergerie', `${data.conciergeMargin.toLocaleString('fr-FR')} ${data.currency}`],
      ];

      for (const [label, value] of kpis) {
        doc.fontSize(11).fillColor('#333').text(label, { continued: true });
        doc.fillColor('#C9A96E').text(` ${value}`, { align: 'right' });
      }

      doc.moveDown(1.5);

      // Revenue by villa
      if (data.revenueByVilla.length > 0) {
        doc.fontSize(14).fillColor('#C9A96E').text('CA par Villa');
        doc.moveDown(0.5);
        for (const v of data.revenueByVilla.slice(0, 10)) {
          doc.fontSize(10).fillColor('#333').text(v.name, { continued: true });
          doc.fillColor('#555').text(` — ${v.amount.toLocaleString('fr-FR')} ${data.currency}`, { align: 'right' });
        }
        doc.moveDown(1.5);
      }

      // Revenue by service
      if (data.revenueByService.length > 0) {
        doc.fontSize(14).fillColor('#C9A96E').text('CA par Service');
        doc.moveDown(0.5);
        for (const s of data.revenueByService.slice(0, 10)) {
          doc.fontSize(10).fillColor('#333').text(s.name, { continued: true });
          doc.fillColor('#555').text(` — ${s.amount.toLocaleString('fr-FR')} ${data.currency}`, { align: 'right' });
        }
        doc.moveDown(1.5);
      }

      // Provider payouts
      if (data.providerPayouts.length > 0) {
        doc.fontSize(14).fillColor('#C9A96E').text('Reversements Prestataires');
        doc.moveDown(0.5);
        for (const p of data.providerPayouts) {
          doc.fontSize(10).fillColor('#333').text(p.name, { continued: true });
          doc.fillColor('#555').text(` — ${p.amount.toLocaleString('fr-FR')} ${data.currency}`, { align: 'right' });
        }
      }

      doc.end();
    });
  }
}
