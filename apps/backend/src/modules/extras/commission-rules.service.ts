import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, ExtrasService } from './extras.service';
import { describeTerms, inPeriod, specificity } from './commission-rules';

export class UpsertCommissionRuleDto {
  @IsIn(['OWNER', 'EMPLOYEE']) beneficiary!: 'OWNER' | 'EMPLOYEE';
  @IsOptional() @IsString() personId?: string | null;
  @IsOptional() @IsString() villaId?: string | null;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsString() serviceId?: string | null;
  @IsIn(['MARGIN', 'MALODGE_SHARE', 'PRICE', 'FIXED']) base!: 'MARGIN' | 'MALODGE_SHARE' | 'PRICE' | 'FIXED';
  /** 0.3 = 30 % */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) rate?: number | null;
  /** Per unit sold, villa currency */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number | null;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validTo?: string | null;
  @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || '—';
const day = (v?: string | null) => (v ? new Date(`${v.slice(0, 10)}T00:00:00.000Z`) : null);

/** Commission rules on the extras: list (with what each applies to), create, change, delete. */
@Injectable()
export class CommissionRulesService {
  constructor(
    private prisma: PrismaService,
    private extras: ExtrasService,
  ) {}

  async list(actor: Actor) {
    const [rules, people, villas, categories, services, lines] = await Promise.all([
      this.prisma.commissionRule.findMany({
        orderBy: [{ beneficiary: 'asc' }, { createdAt: 'asc' }],
        include: {
          person: { select: { id: true, firstName: true, lastName: true } },
          villa: { select: { id: true, name: true, currency: true } },
          category: { select: { id: true, name: true } },
          service: { select: { id: true, name: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { role: { in: ['OWNER', 'EMPLOYEE'] } },
        select: { id: true, firstName: true, lastName: true, role: true, commissionRate: true, commissionBase: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.villa.findMany({
        where: { parentVillaId: null },
        select: { id: true, name: true, currency: true, isActive: true, managementFeeRate: true, owner: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.serviceCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.service.findMany({ select: { id: true, name: true, categoryId: true }, orderBy: { name: 'asc' } }),
      this.extras.loadLines(actor),
    ]);

    // How many extras each rule applies to today (cancelled ones aside).
    const used = new Map<string, { count: number; share: number }>();
    for (const l of lines) {
      if (l.cancelled) continue;
      for (const [r, share] of [[l.ownerRule, l.ownerShare], [l.sellerRule, l.sellerShare]] as const) {
        if (!r) continue;
        const u = used.get(r.id) ?? { count: 0, share: 0 };
        u.count += 1;
        u.share += share ?? 0;
        used.set(r.id, u);
      }
    }
    // Two rules on exactly the same scope whose periods overlap: only one can apply.
    const overlap = (a: (typeof rules)[number], b: (typeof rules)[number]) =>
      (!a.validTo || !b.validFrom || a.validTo >= b.validFrom) && (!b.validTo || !a.validFrom || b.validTo >= a.validFrom);
    const sameScope = (a: (typeof rules)[number], b: (typeof rules)[number]) =>
      a.beneficiary === b.beneficiary && a.personId === b.personId && a.villaId === b.villaId && a.categoryId === b.categoryId && a.serviceId === b.serviceId;

    return {
      rules: rules.map((r) => ({
        id: r.id,
        beneficiary: r.beneficiary,
        person: r.person ? { id: r.person.id, name: fullName(r.person) } : null,
        villa: r.villa ? { id: r.villa.id, name: r.villa.name } : null,
        category: r.category,
        service: r.service,
        base: r.base,
        rate: r.rate,
        amount: r.amount,
        validFrom: r.validFrom?.toISOString().slice(0, 10) ?? null,
        validTo: r.validTo?.toISOString().slice(0, 10) ?? null,
        note: r.note,
        specificity: specificity(r),
        description: describeTerms(r, r.villa?.currency ?? 'MAD'),
        activeToday: inPeriod(r, new Date()),
        usage: used.get(r.id) ?? { count: 0, share: 0 },
        conflicts: rules.filter((o) => o.id !== r.id && sameScope(o, r) && overlap(o, r)).map((o) => o.id),
      })),
      options: {
        owners: people.filter((p) => p.role === 'OWNER').map((p) => ({ id: p.id, name: fullName(p), rate: p.commissionRate })),
        employees: people.filter((p) => p.role === 'EMPLOYEE').map((p) => ({ id: p.id, name: fullName(p), rate: p.commissionRate, base: p.commissionBase })),
        houses: villas.map((v) => ({ id: v.id, name: v.name, currency: v.currency, isActive: v.isActive, managementFeeRate: v.managementFeeRate, owner: v.owner ? { id: v.owner.id, name: fullName(v.owner) } : null })),
        categories,
        services,
      },
    };
  }

  private async clean(dto: UpsertCommissionRuleDto) {
    if (dto.beneficiary === 'OWNER' && dto.base === 'MALODGE_SHARE') throw new BadRequestException('La part Malodge se calcule après celle du propriétaire : choisissez la marge, le prix ou un montant fixe.');
    if (dto.base === 'FIXED' ? dto.amount == null : dto.rate == null) throw new BadRequestException(dto.base === 'FIXED' ? 'Montant par unité attendu' : 'Pourcentage attendu');
    const validFrom = day(dto.validFrom);
    const validTo = day(dto.validTo);
    if (validFrom && validTo && validTo < validFrom) throw new BadRequestException('La fin de la période est avant son début');

    let villaId = dto.villaId || null;
    if (villaId) {
      const v = await this.prisma.villa.findUnique({ where: { id: villaId }, select: { parentVillaId: true } });
      if (!v) throw new BadRequestException('Villa introuvable');
      villaId = v.parentVillaId ?? villaId; // a formula's rule is its house's
    }
    if (dto.personId) {
      const p = await this.prisma.user.findUnique({ where: { id: dto.personId }, select: { role: true } });
      if (!p || p.role !== dto.beneficiary) throw new BadRequestException(dto.beneficiary === 'OWNER' ? 'Propriétaire introuvable' : 'Salarié introuvable');
    }
    let categoryId = dto.categoryId || null;
    if (dto.serviceId) {
      const s = await this.prisma.service.findUnique({ where: { id: dto.serviceId }, select: { categoryId: true } });
      if (!s) throw new BadRequestException('Prestation introuvable');
      if (categoryId && categoryId !== s.categoryId) throw new BadRequestException('Cette prestation n’est pas dans la catégorie choisie');
      categoryId = null; // the service says it all
    } else if (categoryId && !(await this.prisma.serviceCategory.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
      throw new BadRequestException('Catégorie introuvable');
    }
    return {
      beneficiary: dto.beneficiary,
      personId: dto.personId || null,
      villaId,
      categoryId,
      serviceId: dto.serviceId || null,
      base: dto.base,
      rate: dto.base === 'FIXED' ? null : dto.rate!,
      amount: dto.base === 'FIXED' ? dto.amount! : null,
      validFrom,
      validTo,
      note: dto.note?.trim() || null,
    };
  }

  async create(dto: UpsertCommissionRuleDto) {
    const r = await this.prisma.commissionRule.create({ data: await this.clean(dto) });
    return { id: r.id };
  }

  async update(id: string, dto: UpsertCommissionRuleDto) {
    if (!(await this.prisma.commissionRule.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Règle introuvable');
    await this.prisma.commissionRule.update({ where: { id }, data: await this.clean(dto) });
    return { id };
  }

  async remove(id: string) {
    await this.prisma.commissionRule.deleteMany({ where: { id } });
    return { id };
  }
}
