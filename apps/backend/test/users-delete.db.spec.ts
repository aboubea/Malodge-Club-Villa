import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteEmptyClients, deleteUser, deletionCheck, emptyClients } from '../src/modules/users/user-delete';
import { mergeIdenticalPeople, mergePeople } from '../src/modules/extras/people-merge';
import { testDb, wipe } from './db';

/** Deleting people: only records without history; empty client records cleaned up; merges keep everything. */
const prisma = testDb();
const person = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
  prisma.user.create({ data: { email: `${firstName}.${lastName}.${Math.random().toString(36).slice(2)}@malodge.local`.toLowerCase(), password: 'x', firstName, lastName, role: 'CLIENT', canLogin: false, ...extra } as any });
let admin: { id: string; role: string };
let superAdmin: { id: string; role: string };
let villaId: string;

beforeAll(async () => {
  await wipe(prisma);
  superAdmin = await prisma.user.create({ data: { email: 'super@malodge.com', password: 'x', firstName: 'Super', lastName: 'Admin', role: 'SUPER_ADMIN' } });
  admin = await prisma.user.create({ data: { email: 'admin@malodge.com', password: 'x', firstName: 'Ad', lastName: 'Min', role: 'ADMIN' } });
  villaId = (await prisma.villa.create({ data: { name: 'Villa 58', slug: 'v58', address: '-', city: 'Marrakech', country: 'Maroc', currency: 'MAD' } })).id;
});
afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe('deleting a person', () => {
  it('deletes a record without history', async () => {
    const p = await person('Vide', 'Fiche');
    await prisma.notification.create({ data: { userId: p.id, title: 'x', message: 'x', type: 'INFO' } as any }).catch(() => null);
    expect(await deletionCheck(prisma as any, p.id, admin)).toMatchObject({ canDelete: true, blockers: [] });
    expect(await deleteUser(prisma as any, p.id, admin)).toEqual({ deleted: 'Vide Fiche' });
    expect(await prisma.user.findUnique({ where: { id: p.id } })).toBeNull();
  });

  it('refuses a person with stays, says why and what to do', async () => {
    const p = await person('Karine', 'Renard');
    await prisma.reservation.create({ data: { villaId, clientId: p.id, status: 'CONFIRMED', totalAmount: 900, checkIn: new Date('2026-12-01'), checkOut: new Date('2026-12-04') } });
    expect(await deletionCheck(prisma as any, p.id, admin)).toMatchObject({ canDelete: false, blockers: ['1 séjour'] });
    await expect(deleteUser(prisma as any, p.id, admin)).rejects.toThrow(/historique \(1 séjour\).*Fusionnez/);
    expect(await prisma.user.findUnique({ where: { id: p.id } })).not.toBeNull();
  });

  it('never oneself, an administrator only by a super administrator, never the last one', async () => {
    await expect(deleteUser(prisma as any, admin.id, admin)).rejects.toThrow(/propre compte/);
    const other = await prisma.user.create({ data: { email: 'admin2@malodge.com', password: 'x', firstName: 'Ad', lastName: 'Deux', role: 'ADMIN' } });
    await expect(deleteUser(prisma as any, other.id, admin)).rejects.toThrow(/super administrateur/);
    await expect(deleteUser(prisma as any, superAdmin.id, { id: 'someone', role: 'SUPER_ADMIN' })).rejects.toThrow(/dernier super administrateur/);
    expect(await deleteUser(prisma as any, other.id, superAdmin)).toEqual({ deleted: 'Ad Deux' });
  });
});

describe('client records left empty', () => {
  it('lists and deletes only empty records without access', async () => {
    const empty1 = await person('Orphelin', 'Un');
    const empty2 = await person('Orphelin', 'Deux');
    // A real account that never booked yet: kept.
    const account = await prisma.user.create({ data: { email: 'futur@client.com', password: 'x', firstName: 'Futur', lastName: 'Client', role: 'CLIENT', canLogin: true } });
    const list = await emptyClients(prisma as any);
    expect(list.people.map((p) => p.id)).toEqual(expect.arrayContaining([empty1.id, empty2.id]));
    expect(list.people.map((p) => p.id)).not.toContain(account.id);
    const before = await prisma.user.count();
    const r = await deleteEmptyClients(prisma as any);
    expect(r.deleted).toBe(list.count);
    expect(await prisma.user.count()).toBe(before - list.count);
    expect(await prisma.user.findUnique({ where: { id: account.id } })).not.toBeNull();
    expect(await prisma.reservation.count()).toBe(1);
  });
});

describe('merging', () => {
  it('merges records with exactly the same name, keeping every stay apart', async () => {
    const a = await person('Christophe', 'Proprio');
    const b = await person('Christophe', 'Proprio');
    const c = await person('christophe', 'PROPRIO');
    for (const [p, d] of [[a, 1], [b, 10], [c, 20]] as const) {
      await prisma.reservation.create({ data: { villaId, clientId: p.id, status: 'CONFIRMED', totalAmount: 100, checkIn: new Date(Date.UTC(2026, 0, d)), checkOut: new Date(Date.UTC(2026, 0, d + 2)) } });
    }
    const r = await mergeIdenticalPeople(prisma as any);
    expect(r.merged).toBe(2);
    const left = await prisma.user.findMany({ where: { firstName: { equals: 'christophe', mode: 'insensitive' } }, include: { _count: { select: { reservations: true } } } });
    expect(left).toHaveLength(1);
    expect(left[0]._count.reservations).toBe(3);
  });

  it('carries the duplicate’s commission rules and statements to the record kept', async () => {
    const keep = await prisma.user.create({ data: { email: 'marc@owner.com', password: 'x', firstName: 'Marc', lastName: 'Brunet', role: 'OWNER' } });
    const dup = await prisma.user.create({ data: { email: 'marck@fiche.malodge.invalid', password: 'x', firstName: 'Marck', lastName: 'Brunet', role: 'OWNER', canLogin: false } });
    await prisma.commissionRule.create({ data: { beneficiary: 'OWNER', personId: dup.id, base: 'MARGIN', rate: 0.3 } as any });
    await prisma.ownerStatement.create({ data: { ownerId: dup.id, month: '2026-10', status: 'SENT', totalDue: 0, data: {} } as any });
    await prisma.ownerStatement.create({ data: { ownerId: dup.id, month: '2026-11', status: 'DRAFT', totalDue: 0, data: {} } as any });
    await prisma.ownerStatement.create({ data: { ownerId: keep.id, month: '2026-11', status: 'VALIDATED', totalDue: 0, data: {} } as any });

    await mergePeople(prisma as any, dup.id, keep.id, { mergeStays: false });
    expect(await prisma.commissionRule.count({ where: { personId: keep.id } })).toBe(1);
    const statements = await prisma.ownerStatement.findMany({ where: { ownerId: keep.id }, orderBy: { month: 'asc' } });
    expect(statements.map((s) => `${s.month} ${s.status}`)).toEqual(['2026-10 SENT', '2026-11 VALIDATED']);
  });

  it('refuses to merge two validated statements of the same month', async () => {
    const a = await prisma.user.create({ data: { email: 'lea@owner.com', password: 'x', firstName: 'Léa', lastName: 'Martin', role: 'OWNER' } });
    const b = await prisma.user.create({ data: { email: 'lea2@owner.com', password: 'x', firstName: 'Lea', lastName: 'Martin', role: 'OWNER' } });
    await prisma.ownerStatement.create({ data: { ownerId: a.id, month: '2026-09', status: 'SENT', totalDue: 0, data: {} } as any });
    await prisma.ownerStatement.create({ data: { ownerId: b.id, month: '2026-09', status: 'VALIDATED', totalDue: 0, data: {} } as any });
    await expect(mergePeople(prisma as any, b.id, a.id, { mergeStays: false })).rejects.toThrow(/relevé validé pour 2026-09/);
  });
});
