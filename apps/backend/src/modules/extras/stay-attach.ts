/**
 * A stay of the extras tracking that is the same stay as a Lodgify booking (same
 * house, dates that overlap): its extras, payments, messages and events move to the
 * Lodgify booking, then it is deleted, so the stay appears once everywhere. The two
 * client records are merged when they are the same person. Lodgify is never written to.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { looksLikeSamePerson, mergePeople } from './people-merge';

const fullName = (u: { firstName: string; lastName: string }) => [u.firstName, u.lastName].filter(Boolean).join(' ').trim();

export async function attachStayToLodgify(prisma: PrismaClient, fromId: string, toId: string) {
  const select = {
    id: true, label: true, logifyId: true, villaId: true, checkIn: true, checkOut: true, notes: true, clientId: true,
    villa: { select: { parentVillaId: true } },
    client: { select: { id: true, firstName: true, lastName: true, role: true } },
  } as const;
  const [from, to] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: fromId }, select }),
    prisma.reservation.findUnique({ where: { id: toId }, select }),
  ]);
  if (!from || !to) throw new NotFoundException('Séjour introuvable');
  if (from.logifyId) throw new BadRequestException('Ce séjour vient de Lodgify : c’est le séjour du suivi des extras qui se rattache.');
  if (!to.logifyId) throw new BadRequestException('Le séjour de destination doit être une réservation Lodgify.');
  const house = (r: typeof from) => r.villa?.parentVillaId ?? r.villaId;
  if (house(from) !== house(to)) throw new BadRequestException('Les deux séjours ne sont pas dans la même villa.');
  if (from.checkIn && from.checkOut && to.checkIn && to.checkOut && !(from.checkIn < to.checkOut && to.checkIn < from.checkOut)) {
    throw new BadRequestException('Les deux séjours ne se chevauchent pas.');
  }

  const moved = await prisma.$transaction(async (tx) => {
    const orders = await tx.order.updateMany({ where: { reservationId: from.id }, data: { reservationId: to.id, clientId: to.clientId } });
    const settlements = await tx.settlement.updateMany({ where: { reservationId: from.id }, data: { reservationId: to.id } });
    await tx.conversation.updateMany({ where: { reservationId: from.id }, data: { reservationId: to.id } });
    await tx.calendarEvent.updateMany({ where: { reservationId: from.id }, data: { reservationId: to.id } });
    await tx.reservation.update({
      where: { id: to.id },
      data: {
        // The name used in the extras file stays on the booking (file check, search).
        label: to.label ?? from.label,
        notes: [to.notes, from.notes].filter(Boolean).join('\n') || null,
      },
    });
    await tx.reservation.delete({ where: { id: from.id } });
    return { extras: orders.count, settlements: settlements.count };
  });

  // The extras file's client and Lodgify's are one person: one record.
  let mergedClient = false;
  if (from.clientId !== to.clientId && from.client.role === to.client.role && looksLikeSamePerson(fullName(from.client), fullName(to.client))) {
    await mergePeople(prisma, from.clientId, to.clientId, { mergeStays: false });
    mergedClient = true;
  }
  return { stay: from.label ?? fullName(from.client), into: to.label ?? fullName(to.client), ...moved, mergedClient };
}
