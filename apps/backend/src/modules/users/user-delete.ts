/**
 * Deleting a person: only a record without history (no stay, extra, payment, villa,
 * statement or message) is deleted, so nothing that counts in the figures disappears.
 * A person with history is merged into the right record (duplicate) or switched off.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const placeholder = (email: string) => /\.(invalid|local)$/i.test(email);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

const HISTORY = {
  reservations: true,
  orders: true,
  soldOrders: true,
  settlements: true,
  ownedVillas: true,
  sentMessages: true,
} as const;

async function load(prisma: PrismaClient, id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true, canLogin: true, lastLoginAt: true,
      provider: { select: { id: true, _count: { select: { orders: true } } } },
      _count: { select: { ...HISTORY, commissionRules: true } },
      ownerStatements: { where: { status: { not: 'DRAFT' } }, select: { id: true } },
    },
  });
  if (!u) throw new NotFoundException('Utilisateur introuvable');
  return u;
}

/** What keeps a person from being deleted (empty: can be deleted). */
function blockersOf(u: Awaited<ReturnType<typeof load>>): string[] {
  const c = u._count;
  return [
    c.reservations && plural(c.reservations, 'séjour'),
    c.orders + c.soldOrders && plural(c.orders + c.soldOrders, 'extra'),
    (u.provider?._count.orders ?? 0) && plural(u.provider!._count.orders, 'mission'),
    c.settlements && plural(c.settlements, 'règlement'),
    c.ownedVillas && plural(c.ownedVillas, 'villa possédée', 'villas possédées'),
    u.ownerStatements.length && plural(u.ownerStatements.length, 'relevé validé', 'relevés validés'),
    c.sentMessages && plural(c.sentMessages, 'message'),
  ].filter(Boolean) as string[];
}

/** Who may delete whom: never oneself, an administrator only by a super administrator, never the last one. */
async function assertAllowed(prisma: PrismaClient, u: { id: string; role: string }, me: { id: string; role: string }) {
  if (u.id === me.id) throw new ForbiddenException('Vous ne pouvez pas supprimer votre propre compte.');
  if (['ADMIN', 'SUPER_ADMIN'].includes(u.role) && me.role !== 'SUPER_ADMIN') throw new ForbiddenException('Seul un super administrateur peut supprimer un administrateur.');
  if (u.role === 'SUPER_ADMIN' && (await prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } })) <= 1) {
    throw new ForbiddenException('C’est le dernier super administrateur : il ne peut pas être supprimé.');
  }
}

export async function deletionCheck(prisma: PrismaClient, id: string, me: { id: string; role: string }) {
  const u = await load(prisma, id);
  let refused: string | null = null;
  try {
    await assertAllowed(prisma, u, me);
  } catch (e: any) {
    refused = e.message;
  }
  const blockers = blockersOf(u);
  return {
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim(),
    role: u.role,
    canDelete: !refused && blockers.length === 0,
    refused,
    blockers,
    /** Removed with the person: their commission rules. */
    rules: u._count.commissionRules,
  };
}

/** Deletes a person without history (and what only belongs to them: notifications, access, rules…). */
export async function deleteUser(prisma: PrismaClient, id: string, me: { id: string; role: string }) {
  const u = await load(prisma, id);
  await assertAllowed(prisma, u, me);
  const blockers = blockersOf(u);
  if (blockers.length) {
    throw new BadRequestException(
      `${[u.firstName, u.lastName].join(' ').trim()} a un historique (${blockers.join(', ')}) : la supprimer effacerait des chiffres. Fusionnez la fiche avec la bonne personne si c’est un doublon, ou désactivez-la.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.aiQuery.deleteMany({ where: { userId: id } });
    await tx.auditLog.updateMany({ where: { userId: id }, data: { userId: null } });
    await tx.calendarEvent.updateMany({ where: { createdBy: id }, data: { createdBy: null } });
    await tx.ownerStatement.deleteMany({ where: { ownerId: id, status: 'DRAFT' } });
    if (u.provider) await tx.provider.delete({ where: { id: u.provider.id } });
    await tx.user.delete({ where: { id } });
  });
  return { deleted: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() };
}

/**
 * Client records left empty: no history at all and no access to the app (Lodgify
 * requests removed since, bookings moved to the right person…).
 */
function emptyClientsWhere() {
  return {
    role: 'CLIENT' as const,
    lastLoginAt: null,
    OR: [{ canLogin: false }, { email: { endsWith: '.local' } }, { email: { endsWith: '.invalid' } }],
    reservations: { none: {} },
    orders: { none: {} },
    soldOrders: { none: {} },
    settlements: { none: {} },
    sentMessages: { none: {} },
    ownedVillas: { none: {} },
    ownerStatements: { none: {} },
    provider: null,
  };
}

export async function emptyClients(prisma: PrismaClient) {
  const list = await prisma.user.findMany({ where: emptyClientsWhere(), select: { id: true, firstName: true, lastName: true, email: true }, orderBy: { lastName: 'asc' }, take: 500 });
  return { count: list.length, people: list.map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim(), noAccess: placeholder(u.email) })) };
}

export async function deleteEmptyClients(prisma: PrismaClient, among?: string[]) {
  if (among && !among.length) return { deleted: 0 };
  const ids = (await prisma.user.findMany({ where: { ...emptyClientsWhere(), ...(among ? { id: { in: among } } : {}) }, select: { id: true }, take: 500 })).map((u) => u.id);
  if (!ids.length) return { deleted: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.aiQuery.deleteMany({ where: { userId: { in: ids } } });
    await tx.auditLog.updateMany({ where: { userId: { in: ids } }, data: { userId: null } });
    await tx.calendarEvent.updateMany({ where: { createdBy: { in: ids } }, data: { createdBy: null } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
  return { deleted: ids.length };
}
