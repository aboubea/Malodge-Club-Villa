import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from '../fx/fx.service';
import { ExtrasService } from '../extras/extras.service';
import { MailService } from '../mail/mail.service';
import { DEFAULT_CURRENCY, reservationCurrency } from '../../common/money';
import { buildStatement, monthRange, StatementData } from './statement';
import { statementPdf } from './statement-pdf';
import { houseLabel, listingLabel } from '../../common/villa-name';
import { SettingsService } from '../settings/settings.service';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || '—';
const realEmail = (e: string | null | undefined) => (e && !/\.(invalid|local)$/i.test(e) ? e : null);

/**
 * Owners' monthly statements: prepared as drafts (on the 1st by the scheduled job, or on
 * demand), checked by the team, then sent by e-mail with the PDF. A sent statement is
 * never recomputed: it stays as the owner received it.
 */
@Injectable()
export class StatementsService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
    private extras: ExtrasService,
    private mail: MailService,
    @Optional() private settings?: SettingsService,
  ) {}

  private assertMonth(month: string) {
    if (!MONTH.test(month)) throw new BadRequestException('Mois attendu au format AAAA-MM');
  }

  /** The statement of one owner for one month (not saved). */
  async compute(ownerId: string, month: string, lines?: Awaited<ReturnType<ExtrasService['loadLines']>>): Promise<StatementData> {
    this.assertMonth(month);
    const range = monthRange(month);
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, firstName: true, lastName: true, email: true } });
    if (!owner) throw new NotFoundException('Propriétaire introuvable');

    const owned = await this.prisma.villa.findMany({
      where: { ownerId, parentVillaId: null },
      select: { id: true, name: true, managementFeeRate: true, formulas: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    const houseOf = new Map<string, string>();
    owned.forEach((h) => {
      houseOf.set(h.id, h.id);
      h.formulas.forEach((f) => houseOf.set(f.id, h.id));
    });

    const q = await this.fx.quote();
    const [reservations, settlements, allLines] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { villaId: { in: [...houseOf.keys()] }, status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, checkIn: { lte: range.end }, checkOut: { gte: range.start } },
        select: {
          id: true, villaId: true, label: true, checkIn: true, checkOut: true, totalAmount: true, currency: true,
          villa: { select: { name: true, bedrooms: true, currency: true } },
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.settlement.findMany({
        where: { personId: ownerId, status: 'VALIDATED', kind: { in: ['OWNER_PAYOUT', 'OWNER_REFUND'] }, date: { gte: range.start, lte: range.end } },
        select: { date: true, kind: true, amount: true, currency: true, reference: true },
      }),
      lines ? Promise.resolve(lines) : this.extras.loadLines(),
    ]);

    return buildStatement({
      owner: { id: owner.id, name: fullName(owner), email: realEmail(owner.email) },
      month,
      houses: owned.map((h) => ({ id: h.id, name: houseLabel(h.name, h.formulas.length > 0), feeRate: h.managementFeeRate })),
      stays: reservations.map((r) => ({
        id: r.id,
        house: houseOf.get(r.villaId)!,
        // The formula booked, with its own rooms (never its house's).
        villa: listingLabel(r.villa, (owned.find((h) => h.id === houseOf.get(r.villaId))?.formulas.length ?? 0) > 0),
        guest: r.label || fullName(r.client),
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        totalAmount: r.totalAmount,
        currency: reservationCurrency(r),
      })),
      extras: allLines
        .filter((l) => l.owner?.id === ownerId && !l.cancelled && l.date)
        .map((l) => ({
          date: l.date!,
          label: l.label,
          stay: l.stay?.label ?? null,
          villa: l.villa?.name ?? null,
          status: l.status,
          price: l.total,
          ownerShare: l.ownerShare,
          issue: l.issue,
          currency: l.currency || DEFAULT_CURRENCY,
        })),
      payments: settlements.map((s) => ({ date: s.date!, kind: s.kind as 'OWNER_PAYOUT' | 'OWNER_REFUND', amount: s.amount, currency: s.currency, reference: s.reference })),
      toMad: (amount, currency) => {
        const f = this.fx.rateOf(q, currency || DEFAULT_CURRENCY, 'MAD');
        return f == null ? null : amount * f;
      },
      fx: { eurToMad: this.fx.rateOf(q, 'EUR', 'MAD'), date: q?.date ?? null },
    });
  }

  private async save(ownerId: string, month: string, data: StatementData) {
    return this.prisma.ownerStatement.upsert({
      where: { ownerId_month: { ownerId, month } },
      update: { data: data as any, totalDue: data.totals.due },
      create: { ownerId, month, data: data as any, totalDue: data.totals.due, currency: 'MAD' },
    });
  }

  /**
   * Drafts for every owner with activity in the month (stays, extras or payments).
   * Statements already sent are left untouched.
   */
  async prepareMonth(month: string) {
    this.assertMonth(month);
    const owners = await this.prisma.user.findMany({ where: { ownedVillas: { some: {} } }, select: { id: true } });
    const sent = new Set(
      (await this.prisma.ownerStatement.findMany({ where: { month, status: 'SENT' }, select: { ownerId: true } })).map((s) => s.ownerId),
    );
    const lines = await this.extras.loadLines();
    let prepared = 0;
    let skippedSent = 0;
    for (const o of owners) {
      if (sent.has(o.id)) {
        skippedSent++;
        continue;
      }
      const data = await this.compute(o.id, month, lines);
      const active = data.totals.nights > 0 || data.extras.length > 0 || data.payments.length > 0;
      if (!active) {
        await this.prisma.ownerStatement.deleteMany({ where: { ownerId: o.id, month, status: 'DRAFT' } });
        continue;
      }
      await this.save(o.id, month, data);
      prepared++;
    }
    return { month, prepared, alreadySent: skippedSent };
  }

  async list(month: string) {
    this.assertMonth(month);
    const rows = await this.prisma.ownerStatement.findMany({
      where: { month },
      include: { owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
      orderBy: { totalDue: 'desc' },
    });
    return rows.map((r) => {
      const d = r.data as unknown as StatementData;
      return {
        id: r.id,
        month: r.month,
        status: r.status as 'DRAFT' | 'SENT',
        owner: { id: r.owner.id, name: fullName(r.owner), email: realEmail(r.owner.email), phone: r.owner.phone },
        houses: d.houses.map((h) => h.name),
        totals: d.totals,
        warnings: d.warnings,
        sentAt: r.sentAt,
        sentTo: r.sentTo,
        updatedAt: r.updatedAt,
      };
    });
  }

  private async get(id: string) {
    const st = await this.prisma.ownerStatement.findUnique({ where: { id }, include: { owner: { select: { firstName: true, email: true } } } });
    if (!st) throw new NotFoundException('Relevé introuvable');
    return st;
  }

  async recompute(id: string) {
    const st = await this.get(id);
    if (st.status === 'SENT') throw new BadRequestException('Ce relevé a déjà été envoyé : il reste tel que le propriétaire l’a reçu.');
    await this.save(st.ownerId, st.month, await this.compute(st.ownerId, st.month));
    return (await this.list(st.month)).find((r) => r.id === id);
  }

  /** The PDF; an owner can only read their own statements that were sent. */
  async pdf(id: string, viewer: { id: string; role: string }) {
    const st = await this.get(id);
    const staff = ['SUPER_ADMIN', 'ADMIN'].includes(viewer.role);
    if (!staff && !(viewer.role === 'OWNER' && viewer.id === st.ownerId && st.status === 'SENT')) throw new ForbiddenException();
    const data = st.data as unknown as StatementData;
    return { buffer: await statementPdf(data, await this.settings?.companyName()), filename: `releve-${st.month}-${data.owner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf` };
  }

  async send(id: string, actorId: string) {
    const st = await this.get(id);
    const to = realEmail(st.owner.email);
    if (!to) throw new BadRequestException('Ce propriétaire n’a pas d’adresse e-mail : téléchargez le PDF et envoyez-le par WhatsApp.');
    const data = st.data as unknown as StatementData;
    const { buffer, filename } = await this.pdf(id, { id: actorId, role: 'ADMIN' });
    const res = await this.mail.sendOwnerStatement(to, st.owner.firstName, data.monthLabel, buffer, filename);
    if (!res.sent) throw new BadRequestException(`Relevé non envoyé : ${res.error}`);
    await this.prisma.ownerStatement.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), sentTo: to, sentById: actorId } });
    return { sent: true, to };
  }

  /** Every draft of the month that has an e-mail address. */
  async sendAll(month: string, actorId: string) {
    const drafts = (await this.list(month)).filter((s) => s.status === 'DRAFT');
    const result = { sent: 0, noEmail: [] as string[], failed: [] as { owner: string; error: string }[] };
    for (const d of drafts) {
      if (!d.owner.email) {
        result.noEmail.push(d.owner.name);
        continue;
      }
      try {
        await this.send(d.id, actorId);
        result.sent++;
      } catch (e: any) {
        result.failed.push({ owner: d.owner.name, error: e?.response?.message ?? e?.message ?? String(e) });
      }
    }
    return result;
  }

  /** Marks a statement handed over another way (WhatsApp, in person). */
  async markSent(id: string, actorId: string, how: string) {
    await this.get(id);
    await this.prisma.ownerStatement.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), sentTo: how.slice(0, 100), sentById: actorId } });
    return { sent: true };
  }

  /** An owner's statements that were sent. */
  async mine(ownerId: string) {
    const rows = await this.prisma.ownerStatement.findMany({ where: { ownerId, status: 'SENT' }, orderBy: { month: 'desc' }, select: { id: true, month: true, totalDue: true, sentAt: true, data: true } });
    return rows.map((r) => ({ id: r.id, month: r.month, monthLabel: (r.data as any)?.monthLabel ?? r.month, totalDue: r.totalDue, sentAt: r.sentAt }));
  }
}
