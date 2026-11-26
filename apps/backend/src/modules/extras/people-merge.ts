/**
 * Duplicate people (a client, provider, owner or employee keyed twice, e.g. a typo
 * "Marc brunet" / "Marck brunet"): detection and merge. Everything that points to
 * the duplicate moves to the person kept; for clients, their stays at the same
 * villa can be merged too. The old name is remembered so the extras file (date
 * check, re-import) still lands on the right record.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const NAME_ALIASES_KEY = 'extras.nameAliases';
const MERGEABLE = ['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE'] as const;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fullName = (u: { firstName: string; lastName: string }) => [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
const placeholder = (email: string) => /\.(invalid|local)$/i.test(email);

function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Same person written twice: same letters once accents, case and spacing are ignored, or one or two typos. */
export function looksLikeSamePerson(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x.replace(/ /g, '') === y.replace(/ /g, '')) return true;
  return Math.min(x.length, y.length) >= 5 && distance(x, y) <= 2;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function load(prisma: PrismaClient, id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true, canLogin: true, phone: true, notes: true, password: true,
      commissionRate: true, commissionBase: true,
      provider: { select: { id: true } },
      reservations: { select: { id: true, label: true, villaId: true, logifyId: true, checkIn: true, checkOut: true, villa: { select: { name: true } } } },
      _count: { select: { orders: true, soldOrders: true, settlements: true, ownedVillas: true } },
    },
  });
  if (!u) throw new NotFoundException('Personne introuvable');
  return u;
}

/** Pairs of people of the same role that look like the same person. */
export async function duplicatePeople(prisma: PrismaClient) {
  const people = await prisma.user.findMany({
    where: { role: { in: [...MERGEABLE] as any } },
    select: { id: true, firstName: true, lastName: true, role: true, email: true, _count: { select: { reservations: true, orders: true, settlements: true } } },
  });
  const pairs: { a: (typeof people)[number] & { name: string }; b: (typeof people)[number] & { name: string } }[] = [];
  const named = people.map((p) => ({ ...p, name: fullName(p) }));
  named.forEach((a, i) =>
    named.slice(i + 1).forEach((b) => {
      if (a.role === b.role && looksLikeSamePerson(a.name, b.name)) pairs.push({ a, b });
    }),
  );
  // The record with more history is suggested as the one to keep.
  const weight = (p: (typeof named)[number]) => p._count.reservations + p._count.orders + p._count.settlements + (placeholder(p.email) ? 0 : 100);
  return pairs.map(({ a, b }) => {
    const [keep, drop] = weight(a) >= weight(b) ? [a, b] : [b, a];
    return {
      role: keep.role,
      keep: { id: keep.id, name: keep.name, stays: keep._count.reservations, extras: keep._count.orders, settlements: keep._count.settlements },
      drop: { id: drop.id, name: drop.name, stays: drop._count.reservations, extras: drop._count.orders, settlements: drop._count.settlements },
    };
  });
}

/** What merging `sourceId` into `targetId` moves, and the stays that would be merged. */
export async function mergePeoplePreview(prisma: PrismaClient, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new BadRequestException('Choisissez une autre personne.');
  const [s, t] = await Promise.all([load(prisma, sourceId), load(prisma, targetId)]);
  if (!MERGEABLE.includes(s.role as any) || !MERGEABLE.includes(t.role as any)) {
    throw new BadRequestException('Seuls les clients, prestataires, propriétaires et salariés se fusionnent.');
  }
  if (s.role !== t.role) throw new BadRequestException('Les deux fiches n’ont pas le même rôle.');
  // Stays of the duplicate at a villa where the person kept already has a stay (not two Lodgify bookings).
  const stayPairs = s.reservations
    .filter((r) => !r.logifyId)
    .map((r) => ({ from: r, into: t.reservations.find((x) => x.villaId === r.villaId) }))
    .filter((p): p is { from: (typeof s.reservations)[number]; into: (typeof t.reservations)[number] } => !!p.into);
  return {
    role: s.role,
    source: { id: s.id, name: fullName(s), email: placeholder(s.email) ? null : s.email, canLogin: s.canLogin },
    target: { id: t.id, name: fullName(t), email: placeholder(t.email) ? null : t.email, canLogin: t.canLogin },
    moves: {
      stays: s.reservations.length,
      extras: s._count.orders + s._count.soldOrders,
      settlements: s._count.settlements,
      villas: s._count.ownedVillas,
    },
    // The kept record takes the duplicate's real e-mail (and access) when it has none.
    takesEmail: placeholder(t.email) && !placeholder(s.email),
    stayPairs: stayPairs.map((p) => ({
      villa: p.from.villa?.name ?? '—',
      from: { id: p.from.id, label: p.from.label ?? fullName(s), checkIn: day(p.from.checkIn), checkOut: day(p.from.checkOut) },
      into: { id: p.into.id, label: p.into.label ?? fullName(t), checkIn: day(p.into.checkIn), checkOut: day(p.into.checkOut) },
    })),
  };
}

export async function mergePeople(prisma: PrismaClient, sourceId: string, targetId: string, opts: { mergeStays: boolean }) {
  const preview = await mergePeoplePreview(prisma, sourceId, targetId);
  const [s, t] = await Promise.all([load(prisma, sourceId), load(prisma, targetId)]);
  const aliases: Record<string, string> = {};

  await prisma.$transaction(
    async (tx) => {
      /* Stays of the same villa become one stay. */
      let mergedStays = 0;
      if (opts.mergeStays) {
        for (const p of preview.stayPairs) {
          const [from, into] = await Promise.all([
            tx.reservation.findUniqueOrThrow({ where: { id: p.from.id } }),
            tx.reservation.findUniqueOrThrow({ where: { id: p.into.id } }),
          ]);
          const ins = [from.checkIn, into.checkIn].filter(Boolean) as Date[];
          const outs = [from.checkOut, into.checkOut].filter(Boolean) as Date[];
          await tx.order.updateMany({ where: { reservationId: from.id }, data: { reservationId: into.id } });
          await tx.settlement.updateMany({ where: { reservationId: from.id }, data: { reservationId: into.id } });
          await tx.conversation.updateMany({ where: { reservationId: from.id }, data: { reservationId: into.id } });
          await tx.calendarEvent.updateMany({ where: { reservationId: from.id }, data: { reservationId: into.id } });
          await tx.reservation.update({
            where: { id: into.id },
            data: {
              // Only dates that exist are kept (never invented): the earliest arrival, the latest departure.
              checkIn: ins.length ? new Date(Math.min(...ins.map((d) => d.getTime()))) : null,
              checkOut: outs.length ? new Date(Math.max(...outs.map((d) => d.getTime()))) : null,
              archived: from.archived && into.archived,
              notes: [into.notes, from.notes].filter(Boolean).join('\n') || null,
            },
          });
          await tx.reservation.delete({ where: { id: from.id } });
          if (from.label && into.label) aliases[norm(from.label)] = into.label;
          mergedStays++;
        }
      }

      /* Provider record: its orders, services and categories follow. */
      if (s.provider) {
        if (t.provider) {
          const [sp, tp] = [s.provider.id, t.provider.id];
          await tx.order.updateMany({ where: { providerId: sp }, data: { providerId: tp } });
          await tx.service.updateMany({ where: { defaultProviderId: sp }, data: { defaultProviderId: tp } });
          const services = (await tx.serviceProvider.findMany({ where: { providerId: tp }, select: { serviceId: true } })).map((x) => x.serviceId);
          await tx.serviceProvider.updateMany({ where: { providerId: sp, serviceId: { notIn: services.length ? services : ['__none__'] } }, data: { providerId: tp } });
          await tx.serviceProvider.deleteMany({ where: { providerId: sp } });
          const cats = (await tx.providerCategory.findMany({ where: { providerId: tp }, select: { categoryId: true } })).map((x) => x.categoryId);
          await tx.providerCategory.updateMany({ where: { providerId: sp, categoryId: { notIn: cats.length ? cats : ['__none__'] } }, data: { providerId: tp } });
          await tx.providerCategory.deleteMany({ where: { providerId: sp } });
          await tx.provider.delete({ where: { id: sp } });
        } else {
          await tx.provider.update({ where: { id: s.provider.id }, data: { userId: t.id } });
        }
      }

      /* Everything else that points to the duplicate. */
      await tx.reservation.updateMany({ where: { clientId: s.id }, data: { clientId: t.id } });
      await tx.order.updateMany({ where: { clientId: s.id }, data: { clientId: t.id } });
      await tx.order.updateMany({ where: { sellerId: s.id }, data: { sellerId: t.id } });
      await tx.settlement.updateMany({ where: { personId: s.id }, data: { personId: t.id } });
      await tx.settlement.updateMany({ where: { createdById: s.id }, data: { createdById: t.id } });
      await tx.settlement.updateMany({ where: { validatedById: s.id }, data: { validatedById: t.id } });
      await tx.villa.updateMany({ where: { ownerId: s.id }, data: { ownerId: t.id } });
      await tx.message.updateMany({ where: { senderId: s.id }, data: { senderId: t.id } });
      await tx.notification.updateMany({ where: { userId: s.id }, data: { userId: t.id } });
      await tx.aiQuery.updateMany({ where: { userId: s.id }, data: { userId: t.id } });
      await tx.auditLog.updateMany({ where: { userId: s.id }, data: { userId: t.id } });
      await tx.calendarEvent.updateMany({ where: { createdBy: s.id }, data: { createdBy: t.id } });
      const convs = (await tx.conversationParticipant.findMany({ where: { userId: t.id }, select: { conversationId: true } })).map((x) => x.conversationId);
      await tx.conversationParticipant.updateMany({ where: { userId: s.id, conversationId: { notIn: convs.length ? convs : ['__none__'] } }, data: { userId: t.id } });
      await tx.conversationParticipant.deleteMany({ where: { userId: s.id } });
      const villas = (await tx.villaManager.findMany({ where: { userId: t.id }, select: { villaId: true } })).map((x) => x.villaId);
      await tx.villaManager.updateMany({ where: { userId: s.id, villaId: { notIn: villas.length ? villas : ['__none__'] } }, data: { userId: t.id } });
      await tx.villaManager.deleteMany({ where: { userId: s.id } });

      /* The kept record completes what it lacks. */
      const data: Record<string, unknown> = {};
      if (!t.phone && s.phone) data.phone = s.phone;
      if (s.notes) data.notes = [t.notes, s.notes].filter(Boolean).join('\n');
      if (t.commissionRate == null && s.commissionRate != null) data.commissionRate = s.commissionRate;
      if (t.commissionBase == null && s.commissionBase != null) data.commissionBase = s.commissionBase;
      if (preview.takesEmail) {
        // The duplicate's real e-mail (and its access) go to the record kept.
        await tx.user.update({ where: { id: s.id }, data: { email: `merged-${s.id}@fiche.malodge.invalid` } });
        Object.assign(data, { email: s.email, password: s.password, canLogin: s.canLogin });
      }
      if (Object.keys(data).length) await tx.user.update({ where: { id: t.id }, data });
      await tx.passwordResetToken.deleteMany({ where: { userId: s.id } });
      await tx.user.delete({ where: { id: s.id } });

      /* The old name keeps pointing to the record kept (extras file). */
      aliases[norm(fullName(s))] = fullName(t);
      const row = await tx.appSetting.findUnique({ where: { key: NAME_ALIASES_KEY } });
      const value = { ...((row?.value as Record<string, string>) ?? {}), ...aliases };
      await tx.appSetting.upsert({ where: { key: NAME_ALIASES_KEY }, update: { value }, create: { key: NAME_ALIASES_KEY, value } });
      (preview as any).mergedStays = mergedStays;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
  return { merged: preview.source.name, into: preview.target.name, ...preview.moves, mergedStays: (preview as any).mergedStays ?? 0 };
}

/** Names of the extras file rewritten to the records they were merged into. */
export function applyNameAliases<T extends { people: { name: string }[]; extras: { stay: string }[]; settlements: { person: string }[] }>(
  data: T,
  aliases: Record<string, string>,
): T {
  const a = (n: string) => (n && aliases[norm(n)]) || n;
  data.people.forEach((p) => (p.name = a(p.name)));
  data.extras.forEach((e) => (e.stay = a(e.stay)));
  data.settlements.forEach((s) => (s.person = a(s.person)));
  return data;
}
