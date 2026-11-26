import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Account,
  AccountRole,
  ExtraInput,
  ExtraLine,
  SETTLEMENT_KINDS,
  SettlementInput,
  SettlementKind,
  buildAccounts,
  computeExtra,
  proposedPrice,
  totalsByCurrency,
} from './extras.calc';
import { ImportAlreadyDoneError, VILLA_ALIASES_KEY, importExtrasWorkbook, undoImport } from './extras-import';
import { villaCandidates } from './villa-match';
import { checkImportDates } from './extras-dates-check';
import { coherenceReport } from './extras-coherence';
import { FxService } from '../fx/fx.service';
import { currencyForCountry } from '../../common/money';
import { convertVillaCurrency } from '../fx/convert-villa';
import { cleanupCatalogue } from './catalogue-cleanup';
import {
  CreatePersonDto,
  CreateSettlementDto,
  ExtraFiltersDto,
  SettlementFiltersDto,
  UpdatePersonDto,
  UpdateSettlementDto,
  UpdateVillaExtrasDto,
  UpsertCatalogueItemDto,
  UpsertExtraDto,
  UpsertStayDto,
} from './extras.dto';

const MARKUP_KEY = 'extras.catalogMarkup';
const DEFAULT_MARKUP = 0.25;
const STAFF = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];

export interface Actor {
  id: string;
  role: string;
  countries?: string[];
}

const fullName = (u: { firstName: string; lastName: string } | null | undefined) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || '—' : '—';

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

@Injectable()
export class ExtrasService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
  ) {}

  /* ───────────────────────────── Loading ───────────────────────────── */

  private scopeCountries(actor: Actor): string[] | null {
    if (['ADMIN', 'MANAGER'].includes(actor.role) && actor.countries && actor.countries.length > 0) {
      return actor.countries;
    }
    return null;
  }

  /** Loads every order item as an extras line, with live rates. */
  async loadLines(actor?: Actor): Promise<ExtraLine[]> {
    const [orders, villas] = await Promise.all([
      this.prisma.order.findMany({
        include: {
          items: { include: { service: { select: { id: true, name: true } } } },
          reservation: {
            select: {
              id: true, label: true, archived: true, clientId: true, villaId: true, checkIn: true, checkOut: true, datesEstimated: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
          provider: { select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } } },
          seller: { select: { id: true, firstName: true, lastName: true, commissionRate: true, commissionBase: true } },
        },
      }),
      this.prisma.villa.findMany({
        select: {
          id: true, name: true, country: true, currency: true,
          owner: { select: { id: true, firstName: true, lastName: true, commissionRate: true } },
        },
      }),
    ]);
    const villaById = new Map(villas.map((v) => [v.id, v]));

    const lines: ExtraLine[] = [];
    for (const order of orders) {
      const villa = villaById.get(order.villaId ?? '') ?? villaById.get(order.reservation?.villaId ?? '') ?? null;
      for (const item of order.items) {
        const input: ExtraInput = {
          id: item.id,
          date: order.scheduledAt ?? null,
          status: order.status,
          notes: order.notes ?? item.notes ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          label: item.service?.name ?? item.label ?? 'Prestation',
          serviceId: item.serviceId,
          stay: order.reservation
            ? {
                id: order.reservation.id,
                label: order.reservation.label || fullName(order.reservation.client),
                archived: order.reservation.archived,
                clientId: order.reservation.clientId,
                checkIn: order.reservation.checkIn,
                checkOut: order.reservation.checkOut,
                datesEstimated: order.reservation.datesEstimated,
              }
            : null,
          villa: villa ? { id: villa.id, name: villa.name, country: villa.country, currency: villa.currency } : null,
          provider: order.provider ? { id: order.provider.user.id, name: fullName(order.provider.user) } : null,
          owner: villa?.owner ? { id: villa.owner.id, name: fullName(villa.owner), rate: villa.owner.commissionRate } : null,
          seller: order.seller
            ? { id: order.seller.id, name: fullName(order.seller), rate: order.seller.commissionRate, base: order.seller.commissionBase }
            : null,
        };
        lines.push({ ...computeExtra(input), orderId: order.id } as ExtraLine & { orderId: string });
      }
    }

    const countries = actor ? this.scopeCountries(actor) : null;
    const scoped = countries ? lines.filter((l) => !l.villa || countries.includes(l.villa.country)) : lines;
    return scoped.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }

  private filterLines(lines: ExtraLine[], f: ExtraFiltersDto) {
    const from = f.from ? new Date(f.from) : null;
    const to = f.to ? new Date(`${f.to.slice(0, 10)}T23:59:59.999Z`) : null;
    const q = f.search?.trim().toLowerCase();
    return lines.filter((l) => {
      if (f.stayId && l.stay?.id !== f.stayId) return false;
      if (f.villaId && l.villa?.id !== f.villaId) return false;
      if (f.providerId && l.provider?.id !== f.providerId) return false;
      if (f.ownerId && l.owner?.id !== f.ownerId) return false;
      if (f.sellerId && l.seller?.id !== f.sellerId) return false;
      if (f.status && l.status !== f.status) return false;
      if ((f.stays ?? 'active') === 'active' && l.stay?.archived) return false;
      if (f.stays === 'archived' && !l.stay?.archived) return false;
      if (f.incomplete === 'true' && !l.issue && !l.warning) return false;
      if (from && (!l.date || l.date < from)) return false;
      if (to && (!l.date || l.date > to)) return false;
      if (q && ![l.label, l.stay?.label, l.villa?.name, l.provider?.name, l.notes].some((s) => s?.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  private async loadSettlements(actor?: Actor) {
    const rows = await this.prisma.settlement.findMany({
      include: {
        person: { select: { id: true, firstName: true, lastName: true, role: true } },
        reservation: { select: { id: true, label: true, villa: { select: { country: true, name: true } }, client: { select: { firstName: true, lastName: true } } } },
        createdBy: { select: { firstName: true, lastName: true } },
        validatedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    const countries = actor ? this.scopeCountries(actor) : null;
    return countries
      ? rows.filter((r) => !r.reservation || countries.includes(r.reservation.villa.country))
      : rows;
  }

  private toSettlementInputs(rows: Awaited<ReturnType<ExtrasService['loadSettlements']>>): SettlementInput[] {
    return rows.map((r) => ({
      kind: r.kind as SettlementKind,
      status: r.status,
      amount: r.amount,
      currency: r.currency,
      accountId: SETTLEMENT_KINDS[r.kind as SettlementKind].role === 'CLIENT' ? r.reservationId ?? r.personId : r.personId,
    }));
  }

  /** Accounts that must be listed even before any activity. */
  private async accountSeeds(actor?: Actor) {
    const [stays, people] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { OR: [{ label: { not: null } }, { orders: { some: {} } }] },
        select: {
          id: true, label: true, archived: true, checkIn: true, checkOut: true, datesEstimated: true,
          client: { select: { firstName: true, lastName: true } },
          villa: { select: { id: true, name: true, currency: true, country: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { role: { in: ['OWNER', 'EMPLOYEE', 'PROVIDER'] } },
        select: {
          id: true, firstName: true, lastName: true, role: true, phone: true, commissionRate: true, commissionBase: true,
          ownedVillas: { select: { name: true, currency: true } },
        },
      }),
    ]);
    const countries = actor ? this.scopeCountries(actor) : null;
    const seeds: Parameters<typeof buildAccounts>[2] = [];
    for (const s of stays) {
      if (countries && !countries.includes(s.villa.country)) continue;
      seeds.push({
        role: 'CLIENT', id: s.id, name: s.label || fullName(s.client), currency: s.villa.currency, archived: s.archived,
        meta: { villa: s.villa.name, checkIn: s.checkIn, checkOut: s.checkOut, datesEstimated: s.datesEstimated },
      });
    }
    for (const p of people) {
      const currencies = new Set(p.ownedVillas.map((v) => v.currency));
      const currency = currencies.size === 1 ? [...currencies][0] : 'MAD';
      seeds.push({
        role: p.role as AccountRole, id: p.id, name: fullName(p), currency,
        meta: {
          contact: p.phone, rate: p.commissionRate, base: p.commissionBase,
          villas: p.ownedVillas.map((v) => v.name),
        },
      });
    }
    return seeds;
  }

  /* ─────────────────────────────── Extras ─────────────────────────────── */

  async listExtras(f: ExtraFiltersDto, actor: Actor) {
    const lines = this.filterLines(await this.loadLines(actor), f);
    return { lines, totals: totalsByCurrency(lines) };
  }

  private async resolveExtraRefs(dto: UpsertExtraDto) {
    const stay = await this.prisma.reservation.findUnique({ where: { id: dto.stayId }, select: { id: true, clientId: true, villaId: true } });
    if (!stay) throw new BadRequestException('Séjour introuvable');
    let providerId: string | null = null;
    if (dto.providerId) {
      // Accept either a provider id or the provider's user id.
      const p = await this.prisma.provider.findFirst({ where: { OR: [{ id: dto.providerId }, { userId: dto.providerId }] }, select: { id: true } });
      if (!p) throw new BadRequestException('Prestataire introuvable');
      providerId = p.id;
    }
    if (dto.sellerId) {
      const s = await this.prisma.user.findUnique({ where: { id: dto.sellerId }, select: { role: true } });
      if (!s || s.role !== 'EMPLOYEE') throw new BadRequestException('Vendeur introuvable');
    }
    if (dto.serviceId) {
      const svc = await this.prisma.service.findUnique({ where: { id: dto.serviceId }, select: { id: true } });
      if (!svc) throw new BadRequestException('Prestation introuvable');
    }
    if (dto.villaId) {
      const v = await this.prisma.villa.findUnique({ where: { id: dto.villaId }, select: { id: true } });
      if (!v) throw new BadRequestException('Villa introuvable');
    }
    return { stay, providerId };
  }

  async createExtra(dto: UpsertExtraDto) {
    const { stay, providerId } = await this.resolveExtraRefs(dto);
    const total = dto.unitPrice != null ? Math.round(dto.quantity * dto.unitPrice * 100) / 100 : 0;
    const order = await this.prisma.order.create({
      data: {
        clientId: stay.clientId,
        reservationId: stay.id,
        villaId: dto.villaId ?? stay.villaId,
        providerId,
        sellerId: dto.sellerId ?? null,
        status: (dto.status as any) ?? 'PENDING',
        scheduledAt: toDate(dto.date),
        notes: dto.notes ?? null,
        totalAmount: total,
        items: {
          create: {
            serviceId: dto.serviceId ?? null,
            label: dto.serviceId ? null : dto.label,
            quantity: dto.quantity,
            unitPrice: dto.unitPrice ?? null,
            unitCost: dto.unitCost ?? null,
            total,
          },
        },
      },
      include: { items: true },
    });
    return { id: order.items[0].id, orderId: order.id };
  }

  async updateExtra(itemId: string, dto: UpsertExtraDto) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId }, include: { order: { include: { items: true } } } });
    if (!item) throw new NotFoundException('Extra introuvable');
    const { stay, providerId } = await this.resolveExtraRefs(dto);
    const total = dto.unitPrice != null ? Math.round(dto.quantity * dto.unitPrice * 100) / 100 : 0;
    const otherItemsTotal = item.order.items.filter((i) => i.id !== itemId).reduce((s, i) => s + i.total, 0);
    await this.prisma.$transaction([
      this.prisma.orderItem.update({
        where: { id: itemId },
        data: {
          serviceId: dto.serviceId ?? null,
          label: dto.serviceId ? null : dto.label,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice ?? null,
          unitCost: dto.unitCost ?? null,
          total,
        },
      }),
      this.prisma.order.update({
        where: { id: item.orderId },
        data: {
          clientId: stay.clientId,
          reservationId: stay.id,
          villaId: dto.villaId ?? stay.villaId,
          providerId,
          sellerId: dto.sellerId ?? null,
          status: (dto.status as any) ?? item.order.status,
          scheduledAt: toDate(dto.date),
          notes: dto.notes ?? null,
          totalAmount: Math.round((otherItemsTotal + total) * 100) / 100,
        },
      }),
    ]);
    return { id: itemId };
  }

  async deleteExtra(itemId: string) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId }, include: { order: { include: { items: true, payment: true } } } });
    if (!item) throw new NotFoundException('Extra introuvable');
    if (item.order.items.length > 1) {
      await this.prisma.orderItem.delete({ where: { id: itemId } });
      await this.prisma.order.update({ where: { id: item.orderId }, data: { totalAmount: item.order.totalAmount - item.total } });
    } else {
      if (item.order.payment) throw new BadRequestException('Cette commande a un paiement : annulez-la plutôt que de la supprimer.');
      await this.prisma.calendarEvent.deleteMany({ where: { orderId: item.orderId } });
      await this.prisma.order.delete({ where: { id: item.orderId } });
    }
    return { deleted: true };
  }

  /* ────────────────────────────── Accounts ───────────────────────────── */

  async accounts(actor: Actor, role?: AccountRole) {
    const [lines, settlements, seeds] = await Promise.all([this.loadLines(actor), this.loadSettlements(actor), this.accountSeeds(actor)]);
    const all = buildAccounts(lines, this.toSettlementInputs(settlements), seeds);
    const lastByAccount = new Map<string, Date>();
    for (const s of settlements) {
      if (s.status !== 'VALIDATED' || !s.date) continue;
      const def = SETTLEMENT_KINDS[s.kind as SettlementKind];
      const k = `${def.role}|${def.role === 'CLIENT' ? s.reservationId : s.personId}`;
      if (!lastByAccount.has(k)) lastByAccount.set(k, s.date);
    }
    return all
      .filter((a) => !role || a.role === role)
      .map((a) => ({ ...a, lastSettlement: lastByAccount.get(`${a.role}|${a.id}`) ?? null }))
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  }

  async summary(actor: Actor) {
    const [lines, settlements, seeds, people] = await Promise.all([
      this.loadLines(actor),
      this.loadSettlements(actor),
      this.accountSeeds(actor),
      this.prisma.user.findMany({ where: { role: { in: ['OWNER', 'EMPLOYEE'] } }, select: { commissionRate: true } }),
    ]);
    const accounts = buildAccounts(lines, this.toSettlementInputs(settlements), seeds);
    const currencies = new Set<string>([...lines.map((l) => l.currency), ...settlements.map((s) => s.currency)]);
    const sumPos = (accs: Account[]) => Math.round(accs.reduce((s, a) => s + Math.max(0, a.balance), 0) * 100) / 100;

    const perCurrency = [...currencies].sort().map((currency) => {
      const accs = accounts.filter((a) => a.currency === currency);
      const byRole = (r: AccountRole) => accs.filter((a) => a.role === r);
      const treasury = settlements
        .filter((s) => s.currency === currency && s.status === 'VALIDATED')
        .reduce((sum, s) => sum + s.amount * SETTLEMENT_KINDS[s.kind as SettlementKind].treasury, 0);
      const activeNet = lines
        .filter((l) => l.currency === currency && !l.stay?.archived)
        .reduce((s, l) => s + (l.net ?? 0), 0);
      return {
        currency,
        clientsToCollect: sumPos(byRole('CLIENT').filter((a) => !a.archived)),
        archivedToCollect: sumPos(byRole('CLIENT').filter((a) => a.archived)),
        providersToPay: sumPos(byRole('PROVIDER')),
        ownersToPay: sumPos(byRole('OWNER')),
        employeesToPay: sumPos(byRole('EMPLOYEE')),
        activeNet: Math.round(activeNet * 100) / 100,
        treasury: Math.round(treasury * 100) / 100,
      };
    });

    const top = (r: AccountRole, filter: (a: Account) => boolean = () => true) =>
      accounts.filter((a) => a.role === r && filter(a)).sort((a, b) => b.balance - a.balance).slice(0, 10);

    return {
      currencies: perCurrency,
      alerts: {
        incompleteExtras: lines.filter((l) => !l.cancelled && l.issue).length,
        dateWarnings: lines.filter((l) => !l.cancelled && l.warning).length,
        staysToDate: seeds.filter((s) => {
          const m = s.meta as { datesEstimated?: boolean; checkIn?: Date | null; checkOut?: Date | null } | undefined;
          return s.role === 'CLIENT' && !s.archived && (m?.datesEstimated || !m?.checkIn || !m?.checkOut);
        }).length,
        pendingSettlements: settlements.filter((s) => s.status === 'PENDING').length,
        settingsToCheck: people.filter((p) => p.commissionRate == null).length,
      },
      topClients: top('CLIENT', (a) => !a.archived),
      topOwners: top('OWNER'),
      topEmployees: top('EMPLOYEE'),
      topProviders: top('PROVIDER'),
      recentSettlements: settlements.slice(0, 8).map((s) => this.presentSettlement(s)),
    };
  }

  /* ───────────────────────────── Settlements ─────────────────────────── */

  private presentSettlement(s: Awaited<ReturnType<ExtrasService['loadSettlements']>>[number]) {
    const def = SETTLEMENT_KINDS[s.kind as SettlementKind];
    return {
      id: s.id,
      kind: s.kind,
      kindLabel: def.label,
      role: def.role,
      status: s.status,
      date: s.date,
      amount: s.amount,
      currency: s.currency,
      netSettled: s.status === 'VALIDATED' ? s.amount * def.balance : 0,
      treasury: s.status === 'VALIDATED' ? s.amount * def.treasury : 0,
      method: s.method,
      reference: s.reference,
      note: s.note,
      person: { id: s.person.id, name: fullName(s.person) },
      stay: s.reservation ? { id: s.reservation.id, label: s.reservation.label || fullName(s.reservation.client), villa: s.reservation.villa.name } : null,
      createdBy: s.createdBy ? fullName(s.createdBy) : null,
      validatedBy: s.validatedBy ? fullName(s.validatedBy) : null,
      validatedAt: s.validatedAt,
      createdAt: s.createdAt,
    };
  }

  async listSettlements(f: SettlementFiltersDto, actor: Actor) {
    const from = f.from ? new Date(f.from) : null;
    const to = f.to ? new Date(`${f.to.slice(0, 10)}T23:59:59.999Z`) : null;
    const rows = (await this.loadSettlements(actor))
      .map((s) => this.presentSettlement(s))
      .filter((s) => {
        if (f.role && s.role !== f.role) return false;
        if (f.personId && s.person.id !== f.personId && s.stay?.id !== f.personId) return false;
        if (f.status && s.status !== f.status) return false;
        if (from && (!s.date || s.date < from)) return false;
        if (to && (!s.date || s.date > to)) return false;
        return true;
      });
    const totals = new Map<string, { currency: string; inflow: number; outflow: number; net: number; pending: number }>();
    for (const s of rows) {
      const t = totals.get(s.currency) ?? { currency: s.currency, inflow: 0, outflow: 0, net: 0, pending: 0 };
      if (s.status === 'PENDING') t.pending += 1;
      if (s.treasury > 0) t.inflow += s.treasury;
      if (s.treasury < 0) t.outflow += -s.treasury;
      t.net += s.treasury;
      totals.set(s.currency, t);
    }
    return { settlements: rows, totals: [...totals.values()] };
  }

  async createSettlement(dto: CreateSettlementDto, actor: Actor) {
    const def = SETTLEMENT_KINDS[dto.kind as SettlementKind];
    let personId = dto.personId;
    let reservationId: string | null = null;
    let currency = dto.currency;

    if (def.role === 'CLIENT') {
      const stayId = dto.reservationId ?? dto.personId;
      const stay = await this.prisma.reservation.findUnique({ where: { id: stayId }, select: { id: true, clientId: true, villa: { select: { currency: true } } } });
      if (!stay) throw new BadRequestException('Séjour introuvable');
      personId = stay.clientId;
      reservationId = stay.id;
      currency = stay.villa.currency;
    } else {
      const person = await this.prisma.user.findUnique({ where: { id: personId }, select: { role: true } });
      if (!person || person.role !== def.role) throw new BadRequestException(`Cette personne n'a pas le rôle attendu pour « ${def.label} »`);
    }
    if (!currency) throw new BadRequestException('Devise requise');

    const validateNow = !!dto.validate && ADMINS.includes(actor.role);
    const created = await this.prisma.settlement.create({
      data: {
        kind: dto.kind as SettlementKind,
        personId,
        reservationId,
        date: toDate(dto.date),
        amount: Math.round(dto.amount * 100) / 100,
        currency: currency.toUpperCase(),
        method: (dto.method as any) ?? null,
        reference: dto.reference ?? null,
        note: dto.note ?? null,
        createdById: actor.id,
        status: validateNow ? 'VALIDATED' : 'PENDING',
        validatedById: validateNow ? actor.id : null,
        validatedAt: validateNow ? new Date() : null,
      },
    });
    return { id: created.id, status: created.status };
  }

  async updateSettlement(id: string, dto: UpdateSettlementDto, actor: Actor) {
    const s = await this.prisma.settlement.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Règlement introuvable');
    if (s.status !== 'PENDING' && !ADMINS.includes(actor.role)) {
      throw new ForbiddenException('Seul un administrateur peut modifier un règlement validé ou annulé');
    }
    return this.prisma.settlement.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: toDate(dto.date) }),
        ...(dto.amount !== undefined && { amount: Math.round(dto.amount * 100) / 100 }),
        ...(dto.method !== undefined && { method: (dto.method as any) ?? null }),
        ...(dto.reference !== undefined && { reference: dto.reference }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      select: { id: true, status: true },
    });
  }

  async setSettlementStatus(id: string, status: 'VALIDATED' | 'CANCELLED' | 'PENDING', actor: Actor) {
    const s = await this.prisma.settlement.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Règlement introuvable');
    if (status === 'VALIDATED' && !s.date) throw new BadRequestException('Renseignez la date du paiement avant de valider');
    return this.prisma.settlement.update({
      where: { id },
      data: {
        status,
        validatedById: status === 'VALIDATED' ? actor.id : null,
        validatedAt: status === 'VALIDATED' ? new Date() : null,
      },
      select: { id: true, status: true },
    });
  }

  /* ─────────────────────────── People & settings ─────────────────────── */

  async getMarkup(): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: MARKUP_KEY } });
    const v = row ? Number(row.value) : NaN;
    return Number.isFinite(v) ? v : DEFAULT_MARKUP;
  }

  async setMarkup(markup: number) {
    await this.prisma.appSetting.upsert({
      where: { key: MARKUP_KEY },
      update: { value: markup },
      create: { key: MARKUP_KEY, value: markup },
    });
    // Re-price catalogue items that rely on the markup.
    const services = await this.prisma.service.findMany({ where: { publicPrice: null, unitCost: { not: null } }, select: { id: true, unitCost: true } });
    for (const s of services) {
      await this.prisma.service.update({ where: { id: s.id }, data: { basePrice: proposedPrice(s.unitCost, null, markup)! } });
    }
    return { markup, repriced: services.length };
  }

  async settings(actor: Actor) {
    const countries = this.scopeCountries(actor);
    const [markup, people, villaRows, stays, ordersByVilla] = await Promise.all([
      this.getMarkup(),
      this.prisma.user.findMany({
        where: { role: { in: ['OWNER', 'EMPLOYEE', 'PROVIDER'] } },
        select: {
          id: true, firstName: true, lastName: true, role: true, phone: true, email: true, canLogin: true, isActive: true,
          commissionRate: true, commissionBase: true, notes: true,
          ownedVillas: { select: { id: true, name: true } },
          provider: { select: { id: true } },
        },
        orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.villa.findMany({
        where: countries ? { country: { in: countries } } : undefined,
        select: {
          id: true, name: true, city: true, country: true, currency: true, ownerId: true, isActive: true, logifyId: true, parentVillaId: true,
          _count: { select: { reservations: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          OR: [{ label: { not: null } }, { orders: { some: {} } }],
          ...(countries ? { villa: { country: { in: countries } } } : {}),
        },
        select: {
          id: true, label: true, archived: true, checkIn: true, checkOut: true, datesEstimated: true, notes: true, villaId: true, clientId: true,
          client: { select: { firstName: true, lastName: true, phone: true } },
          villa: { select: { name: true, currency: true } },
        },
        orderBy: { checkIn: 'desc' },
      }),
      this.prisma.order.groupBy({ by: ['villaId'], _count: { _all: true } }),
    ]);
    const extrasCount = new Map(ordersByVilla.map((o) => [o.villaId, o._count._all]));
    // Formulas are part of their house: a duplicate is matched with the house only.
    const lodgifyVillas = villaRows.filter((v) => v.logifyId && !(v as { parentVillaId?: string | null }).parentVillaId).map((v) => ({ id: v.id, name: v.name }));
    const villas = villaRows.map(({ _count, logifyId, ...v }) => ({
      ...v,
      lodgify: !!logifyId,
      stays: _count.reservations,
      extras: extrasCount.get(v.id) ?? 0,
      // A villa entered by hand or imported from the spreadsheet that looks like a Lodgify listing.
      duplicates: logifyId ? [] : villaCandidates(v.name, lodgifyVillas).slice(0, 3),
    }));
    return {
      markup,
      people: people.map((p) => ({
        id: p.id,
        role: p.role,
        name: fullName(p),
        contact: p.phone,
        email: p.email.endsWith('@fiche.malodge.invalid') ? null : p.email,
        canLogin: p.canLogin,
        commissionRate: p.commissionRate,
        commissionBase: p.commissionBase,
        notes: p.notes,
        villas: p.ownedVillas,
        issue:
          ['OWNER', 'EMPLOYEE'].includes(p.role) && p.commissionRate == null ? 'Taux à renseigner' : null,
      })),
      villas,
      stays: stays.map((s) => ({
        id: s.id,
        label: s.label || fullName(s.client),
        clientId: s.clientId,
        contact: s.client.phone,
        villaId: s.villaId,
        villa: s.villa.name,
        currency: s.villa.currency,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        archived: s.archived,
        datesEstimated: s.datesEstimated,
        notes: s.notes,
        issue: !s.checkIn || !s.checkOut
          ? 'Dates non renseignées'
          : s.checkOut < s.checkIn
            ? 'Dates à vérifier'
            : s.datesEstimated
              ? 'Dates à confirmer'
              : null,
      })),
    };
  }

  private async createRecordUser(role: string, name: string, extra: Record<string, unknown> = {}) {
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const password = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    return this.prisma.user.create({
      data: {
        email: `${slugify(name)}-${randomBytes(4).toString('hex')}@fiche.malodge.invalid`,
        password,
        firstName,
        lastName: rest.join(' '),
        role: role as any,
        canLogin: false,
        ...extra,
      },
    });
  }

  async createPerson(dto: CreatePersonDto) {
    const user = await this.createRecordUser(dto.role, dto.name, {
      phone: dto.contact ?? null,
      notes: dto.notes ?? null,
      commissionRate: ['OWNER', 'EMPLOYEE'].includes(dto.role) ? dto.commissionRate ?? null : null,
      commissionBase: dto.role === 'EMPLOYEE' ? dto.commissionBase ?? 'MALODGE_MARGIN' : null,
    });
    if (dto.role === 'PROVIDER') {
      await this.prisma.provider.create({ data: { userId: user.id } });
    }
    return { id: user.id };
  }

  async updatePerson(id: string, dto: UpdatePersonDto) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!user) throw new NotFoundException('Personne introuvable');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const [firstName, ...rest] = dto.name.trim().split(/\s+/);
      data.firstName = firstName;
      data.lastName = rest.join(' ');
    }
    if (dto.contact !== undefined) data.phone = dto.contact;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.commissionRate !== undefined && ['OWNER', 'EMPLOYEE'].includes(user.role)) data.commissionRate = dto.commissionRate;
    if (dto.commissionBase !== undefined && user.role === 'EMPLOYEE') data.commissionBase = dto.commissionBase;
    await this.prisma.user.update({ where: { id }, data });
    return { id };
  }

  async updateVilla(id: string, dto: UpdateVillaExtrasDto) {
    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { role: true } });
      if (!owner || owner.role !== 'OWNER') throw new BadRequestException('Propriétaire introuvable');
    }
    const data = {
      ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
      ...(dto.currency && { currency: dto.currency.toUpperCase() }),
    };
    // The formulas of a house share its owner and currency.
    await this.prisma.villa.updateMany({ where: { OR: [{ id }, { parentVillaId: id }] }, data });
    return { id };
  }

  /**
   * Makes a Lodgify listing a formula of another one: the same house offered with
   * more or fewer rooms at its own nightly price. Both listings stay as they are in
   * Lodgify (read-only) and each booking keeps its own amount; in the app the house
   * has one calendar line, one owner and one currency.
   */
  async groupVilla(formulaId: string, mainId: string) {
    if (formulaId === mainId) throw new BadRequestException('Choisissez une autre villa.');
    const select = { id: true, name: true, logifyId: true, parentVillaId: true, ownerId: true, currency: true } as const;
    const [formula, main0] = await Promise.all([
      this.prisma.villa.findUnique({ where: { id: formulaId }, select }),
      this.prisma.villa.findUnique({ where: { id: mainId }, select }),
    ]);
    if (!formula || !main0) throw new NotFoundException('Villa introuvable');
    if (!formula.logifyId || !main0.logifyId) {
      throw new BadRequestException('Seules deux annonces Lodgify se regroupent en formules ; pour une villa créée dans l’appli, utilisez la fusion.');
    }
    // A formula of a formula belongs to the house.
    const main = main0.parentVillaId ? await this.prisma.villa.findUniqueOrThrow({ where: { id: main0.parentVillaId }, select }) : main0;
    if (main.id === formula.id) throw new BadRequestException('Cette annonce est déjà la villa principale.');
    // One currency for the house: the one already used by extras, else the country's.
    const extrasOf = (id: string) => this.prisma.order.count({ where: { OR: [{ villaId: id }, { reservation: { villaId: id } }] } });
    const [mainExtras, formulaExtras, country] = await Promise.all([
      extrasOf(main.id),
      extrasOf(formula.id),
      this.prisma.villa.findUnique({ where: { id: main.id }, select: { country: true } }).then((v) => v?.country),
    ]);
    const currency = mainExtras ? main.currency : formulaExtras ? formula.currency : currencyForCountry(country);
    if (mainExtras && formulaExtras && main.currency !== formula.currency) {
      throw new BadRequestException(`Les deux annonces ont des extras dans des devises différentes (${main.currency} / ${formula.currency}) : convertissez-en une d’abord.`);
    }
    const ownerId = main.ownerId ?? formula.ownerId;
    await this.prisma.$transaction([
      // Its own formulas come along.
      this.prisma.villa.updateMany({ where: { parentVillaId: formula.id }, data: { parentVillaId: main.id, ownerId, currency } }),
      this.prisma.villa.update({ where: { id: formula.id }, data: { parentVillaId: main.id, ownerId, currency } }),
      this.prisma.villa.update({ where: { id: main.id }, data: { ownerId, currency } }),
    ]);
    return { grouped: formula.name, into: main.name };
  }

  async ungroupVilla(id: string) {
    const v = await this.prisma.villa.findUnique({ where: { id }, select: { id: true, name: true, parentVillaId: true } });
    if (!v) throw new NotFoundException('Villa introuvable');
    if (!v.parentVillaId) throw new BadRequestException('Cette villa n’est pas une formule.');
    await this.prisma.villa.update({ where: { id }, data: { parentVillaId: null } });
    return { ungrouped: v.name };
  }

  /**
   * Merges a villa entered by hand or imported from the spreadsheet into another one
   * (typically its Lodgify listing): stays, extras, villa services, managers, documents
   * and agenda entries move over, owner and currency are carried, the duplicate is
   * deleted and its name is remembered so a future import attaches to the right villa.
   * Only this application's database changes — nothing is ever written to Lodgify.
   */
  /**
   * What merging `sourceId` into `targetId` would do, or why it cannot be done.
   * Amounts are never converted: villas whose extras are in two different
   * currencies cannot be merged.
   */
  async mergeVillaPreview(sourceId: string, targetId0: string) {
    if (sourceId === targetId0) throw new BadRequestException('Choisissez une autre villa.');
    // Merging into a formula merges into its house.
    const parent = (await this.prisma.villa.findUnique({ where: { id: targetId0 }, select: { parentVillaId: true } }))?.parentVillaId;
    const targetId = parent ?? targetId0;
    const select = { id: true, name: true, logifyId: true, currency: true, country: true, ownerId: true } as const;
    const [source, target] = await Promise.all([
      this.prisma.villa.findUnique({ where: { id: sourceId }, select }),
      this.prisma.villa.findUnique({ where: { id: targetId }, select }),
    ]);
    if (!source || !target) throw new NotFoundException('Villa introuvable');
    const count = async (villaId: string) => {
      const [stays, extras, currencies] = await Promise.all([
        this.prisma.reservation.count({ where: { villaId } }),
        this.prisma.order.count({ where: { OR: [{ villaId }, { reservation: { villaId } }] } }),
        this.prisma.service.findMany({
          where: { orderItems: { some: { order: { OR: [{ villaId }, { reservation: { villaId } }] } } } },
          select: { currency: true },
          distinct: ['currency'],
        }),
      ]);
      return { stays, extras, serviceCurrencies: currencies.map((c) => c.currency) };
    };
    const [from, into] = await Promise.all([count(sourceId), count(targetId)]);

    let blocker: string | null = null;
    if (source.logifyId) blocker = 'Une villa issue de Lodgify ne peut pas être fusionnée dans une autre : déposez plutôt l’autre villa sur elle.';
    else if (source.ownerId && target.ownerId && source.ownerId !== target.ownerId)
      blocker = 'Les deux villas ont un propriétaire différent : alignez-les dans Suivi des extras > Réglages avant de fusionner.';
    else if (from.extras > 0 && into.extras > 0 && source.currency !== target.currency)
      blocker = `Devises différentes (${source.currency} / ${target.currency}) avec des extras des deux côtés : fusionner fausserait les montants.`;
    // The extras keep the currency they were entered in.
    const currency = from.extras > 0 ? source.currency : target.currency;

    return {
      source: { id: source.id, name: source.name, lodgify: !!source.logifyId, currency: source.currency, country: source.country, ...from },
      target: { id: target.id, name: target.name, lodgify: !!target.logifyId, currency: target.currency, country: target.country, ...into },
      currency,
      currencyChanges: currency !== target.currency,
      blocker,
    };
  }

  async mergeVilla(sourceId: string, targetId: string) {
    const preview = await this.mergeVillaPreview(sourceId, targetId);
    if (preview.blocker) throw new BadRequestException(preview.blocker);
    targetId = preview.target.id; // the house, when a formula was chosen
    const source = { name: preview.source.name };
    const target = await this.prisma.villa.findUniqueOrThrow({ where: { id: targetId }, select: { ownerId: true } });
    const sourceOwner = (await this.prisma.villa.findUniqueOrThrow({ where: { id: sourceId }, select: { ownerId: true } })).ownerId;
    const currency = preview.currency;

    const moved = await this.prisma.$transaction(async (tx) => {
      const stays = await tx.reservation.updateMany({ where: { villaId: sourceId }, data: { villaId: targetId } });
      const extras = await tx.order.updateMany({ where: { villaId: sourceId }, data: { villaId: targetId } });
      const targetServices = (await tx.villaService.findMany({ where: { villaId: targetId }, select: { serviceId: true } })).map((x) => x.serviceId);
      await tx.villaService.updateMany({ where: { villaId: sourceId, serviceId: { notIn: targetServices.length ? targetServices : ['__none__'] } }, data: { villaId: targetId } });
      await tx.villaService.deleteMany({ where: { villaId: sourceId } });
      const targetManagers = (await tx.villaManager.findMany({ where: { villaId: targetId }, select: { userId: true } })).map((x) => x.userId);
      await tx.villaManager.updateMany({ where: { villaId: sourceId, userId: { notIn: targetManagers.length ? targetManagers : ['__none__'] } }, data: { villaId: targetId } });
      await tx.villaManager.deleteMany({ where: { villaId: sourceId } });
      await tx.document.updateMany({ where: { villaId: sourceId }, data: { villaId: targetId } });
      await tx.calendarEvent.updateMany({ where: { villaId: sourceId }, data: { villaId: targetId } });
      await tx.villa.update({ where: { id: targetId }, data: { currency, ownerId: target.ownerId ?? sourceOwner } });
      await tx.villa.delete({ where: { id: sourceId } });
      const row = await tx.appSetting.findUnique({ where: { key: VILLA_ALIASES_KEY } });
      const aliases = { ...((row?.value as Record<string, string>) ?? {}), [source.name]: targetId };
      await tx.appSetting.upsert({ where: { key: VILLA_ALIASES_KEY }, update: { value: aliases }, create: { key: VILLA_ALIASES_KEY, value: aliases } });
      return { stays: stays.count, extras: extras.count };
    });
    return { merged: source.name, into: preview.target.name, currency, ...moved };
  }

  async createStay(dto: UpsertStayDto) {
    const villa = await this.prisma.villa.findUnique({ where: { id: dto.villaId }, select: { id: true } });
    if (!villa) throw new BadRequestException('Villa introuvable');
    const clientId = dto.clientId ?? (await this.createRecordUser('CLIENT', dto.label)).id;
    // Stay dates are calendar days (00:00 UTC). A date nobody gave stays empty: never today's date.
    const checkIn = toDate(dto.checkIn);
    const checkOut = toDate(dto.checkOut);
    const stay = await this.prisma.reservation.create({
      data: {
        label: dto.label.trim(),
        villaId: dto.villaId,
        clientId,
        checkIn,
        checkOut,
        totalAmount: 0,
        status: 'CONFIRMED',
        archived: dto.archived ?? false,
        datesEstimated: false,
        notes: dto.notes ?? null,
        source: 'extras',
      },
    });
    return { id: stay.id };
  }

  async updateStay(id: string, dto: Partial<UpsertStayDto>) {
    const stay = await this.prisma.reservation.findUnique({ where: { id }, select: { id: true } });
    if (!stay) throw new NotFoundException('Séjour introuvable');
    await this.prisma.reservation.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label.trim() }),
        ...(dto.villaId !== undefined && { villaId: dto.villaId }),
        // An emptied date is cleared, not kept.
        ...(dto.checkIn !== undefined && { checkIn: toDate(dto.checkIn) }),
        ...(dto.checkOut !== undefined && { checkOut: toDate(dto.checkOut) }),
        ...(dto.datesEstimated !== undefined && { datesEstimated: dto.datesEstimated }),
        ...(dto.archived !== undefined && { archived: dto.archived }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    return { id };
  }

  /* ────────────────────────────── Catalogue ──────────────────────────── */

  async catalogue() {
    const [markup, services] = await Promise.all([
      this.getMarkup(),
      this.prisma.service.findMany({
        include: {
          category: { select: { id: true, name: true } },
          defaultProvider: { select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      markup,
      items: services.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category.name,
        unit: s.unit,
        unitCost: s.unitCost,
        publicPrice: s.publicPrice,
        proposedPrice: proposedPrice(s.unitCost, s.publicPrice, markup) ?? s.basePrice,
        currency: s.currency,
        isActive: s.isActive,
        defaultProvider: s.defaultProvider ? { id: s.defaultProvider.user.id, name: fullName(s.defaultProvider.user) } : null,
      })),
    };
  }

  private async categoryId(name: string) {
    const existing = await this.prisma.serviceCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (existing) return existing.id;
    let slug = slugify(name);
    if (await this.prisma.serviceCategory.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString('hex')}`;
    return (await this.prisma.serviceCategory.create({ data: { name, slug } })).id;
  }

  private async providerIdFromAny(id: string | null | undefined) {
    if (!id) return null;
    const p = await this.prisma.provider.findFirst({ where: { OR: [{ id }, { userId: id }] }, select: { id: true } });
    if (!p) throw new BadRequestException('Prestataire introuvable');
    return p.id;
  }

  async createCatalogueItem(dto: UpsertCatalogueItemDto) {
    if (!dto.name || !dto.category) throw new BadRequestException('Nom et catégorie requis');
    const markup = await this.getMarkup();
    const price = proposedPrice(dto.unitCost ?? null, dto.publicPrice ?? null, markup);
    if (price === null) throw new BadRequestException('Renseignez un coût ou un prix public');
    let slug = slugify(dto.name);
    if (await this.prisma.service.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(3).toString('hex')}`;
    const created = await this.prisma.service.create({
      data: {
        name: dto.name.trim(),
        slug,
        categoryId: await this.categoryId(dto.category.trim()),
        unit: dto.unit ?? null,
        unitCost: dto.unitCost ?? null,
        publicPrice: dto.publicPrice ?? null,
        basePrice: price,
        currency: (dto.currency ?? 'MAD').toUpperCase(),
        defaultProviderId: await this.providerIdFromAny(dto.defaultProviderId),
        isActive: dto.isActive ?? true,
      },
    });
    return { id: created.id };
  }

  async updateCatalogueItem(id: string, dto: UpsertCatalogueItemDto) {
    const svc = await this.prisma.service.findUnique({ where: { id } });
    if (!svc) throw new NotFoundException('Prestation introuvable');
    const markup = await this.getMarkup();
    const unitCost = dto.unitCost !== undefined ? dto.unitCost : svc.unitCost;
    const publicPrice = dto.publicPrice !== undefined ? dto.publicPrice : svc.publicPrice;
    await this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.category && { categoryId: await this.categoryId(dto.category.trim()) }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.currency && { currency: dto.currency.toUpperCase() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.defaultProviderId !== undefined && { defaultProviderId: await this.providerIdFromAny(dto.defaultProviderId) }),
        unitCost,
        publicPrice,
        basePrice: proposedPrice(unitCost, publicPrice, markup) ?? svc.basePrice,
      },
    });
    return { id };
  }

  /* ──────────────────────────── Select options ───────────────────────── */

  async options(actor: Actor) {
    const s = await this.settings(actor);
    const cat = await this.catalogue();
    return {
      markup: s.markup,
      stays: s.stays.filter((x) => !x.archived).concat(s.stays.filter((x) => x.archived)),
      villas: s.villas,
      providers: s.people.filter((p) => p.role === 'PROVIDER').map((p) => ({ id: p.id, name: p.name })),
      owners: s.people.filter((p) => p.role === 'OWNER').map((p) => ({ id: p.id, name: p.name })),
      sellers: s.people.filter((p) => p.role === 'EMPLOYEE').map((p) => ({ id: p.id, name: p.name })),
      catalogue: cat.items.filter((i) => i.isActive),
      settlementKinds: Object.entries(SETTLEMENT_KINDS).map(([kind, d]) => ({ kind, ...d })),
    };
  }

  /* ─────────────────────────── Spreadsheet import ────────────────────── */

  async importWorkbook(buffer: Buffer, opts: { dryRun: boolean; fileName?: string }) {
    try {
      return await importExtrasWorkbook(this.prisma as any, buffer, opts);
    } catch (e) {
      if (e instanceof ImportAlreadyDoneError) {
        const prev = (e.previous ?? {}) as { at?: string; file?: string };
        const when = prev.at ? new Date(prev.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'précédemment';
        throw new BadRequestException(`Le fichier de suivi a déjà été importé (${prev.file ?? 'fichier'} — ${when}). Un second import créerait des doublons.`);
      }
      throw new BadRequestException(e instanceof Error ? e.message : 'Import impossible');
    }
  }

  /** Moves a villa to another currency, its extras converted at today's rate (original kept). */
  async convertVillaCurrency(id: string, to: string) {
    try {
      return await convertVillaCurrency(this.prisma, this.fx, id, to);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Conversion impossible');
    }
  }

  /** Read-only report of what does not add up across villas, stays, extras, payments and Lodgify. */
  async coherence(actor: Actor) {
    const { lines } = await this.listExtras({ stays: 'all' } as ExtraFiltersDto, actor);
    return coherenceReport(this.prisma as any, lines as any);
  }

  async checkImportDates(buffer: Buffer, apply: string[]) {
    try {
      return await checkImportDates(this.prisma as any, buffer, { apply });
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(e?.message ?? 'Vérification impossible');
    }
  }

  async undoWorkbookImport(dryRun: boolean) {
    try {
      const report = await undoImport(this.prisma as any, { dryRun });
      if (!dryRun && report.blockers.length) {
        throw new BadRequestException(`Annulation impossible : ${report.blockers.join(' ; ')}.`);
      }
      return report;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(e instanceof Error ? e.message : 'Annulation impossible');
    }
  }

  cleanupCatalogue(dryRun: boolean) {
    return cleanupCatalogue(this.prisma as any, { dryRun });
  }

  async importStatus() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'extras.spreadsheetImport' } });
    return { imported: !!row, details: row?.value ?? null };
  }

  /* ───────────────────────────── My account ──────────────────────────── */

  async me(user: Actor) {
    if (STAFF.includes(user.role)) return { role: user.role, accounts: [], lines: [], settlements: [] };
    const [lines, settlements, seeds] = await Promise.all([this.loadLines(), this.loadSettlements(), this.accountSeeds()]);
    const accounts = buildAccounts(lines, this.toSettlementInputs(settlements), seeds);
    const role = user.role as AccountRole;

    let mine: ExtraLine[] = [];
    let myAccounts: Account[] = [];
    let mySettlements = settlements;
    if (role === 'CLIENT') {
      mine = lines.filter((l) => l.stay?.clientId === user.id);
      const stayIds = new Set(
        (await this.prisma.reservation.findMany({ where: { clientId: user.id }, select: { id: true } })).map((r) => r.id),
      );
      myAccounts = accounts.filter((a) => a.role === 'CLIENT' && stayIds.has(a.id));
      mySettlements = settlements.filter((s) => s.reservationId && stayIds.has(s.reservationId));
    } else {
      const pick = (l: ExtraLine) =>
        role === 'PROVIDER' ? l.provider?.id : role === 'OWNER' ? l.owner?.id : role === 'EMPLOYEE' ? l.seller?.id : undefined;
      mine = lines.filter((l) => pick(l) === user.id);
      myAccounts = accounts.filter((a) => a.role === role && a.id === user.id && (a.extrasCount > 0 || a.paid !== 0));
      mySettlements = settlements.filter((s) => s.personId === user.id && SETTLEMENT_KINDS[s.kind as SettlementKind].role === role);
    }

    // Each role only sees the figures that concern it.
    const present = (l: ExtraLine) => {
      const common = { id: l.id, date: l.date, label: l.label, status: l.status, currency: l.currency, villa: l.villa?.name ?? null, stay: l.stay?.label ?? null, quantity: l.quantity };
      if (role === 'CLIENT') return { ...common, unitPrice: l.unitPrice, amount: l.total };
      if (role === 'PROVIDER') return { ...common, unitPrice: l.unitCost, amount: l.cost };
      if (role === 'OWNER') return { ...common, billed: l.total, margin: l.margin, rate: l.ownerRate, amount: l.ownerShare };
      return { ...common, base: l.sellerBase === 'TOTAL_MARGIN' ? l.margin : l.malodgeShare, rate: l.sellerRate, amount: l.sellerShare };
    };

    return {
      role,
      accounts: myAccounts.map(({ meta, ...a }) => a),
      lines: mine.map(present),
      settlements: mySettlements
        .filter((s) => s.status !== 'CANCELLED')
        .map((s) => {
          const p = this.presentSettlement(s);
          return { id: p.id, kindLabel: p.kindLabel, status: p.status, date: p.date, amount: p.amount, currency: p.currency, method: p.method, stay: p.stay?.label ?? null };
        }),
    };
  }
}
