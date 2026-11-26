import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from './fx.service';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Moves a villa to another currency (e.g. a Moroccan villa from EUR to MAD) with
 * its extras converted at today's rate. Each converted extra keeps its original
 * currency, the rate and the day, so the amount in euros can always be shown.
 */
export async function convertVillaCurrency(prisma: PrismaService, fx: FxService, villaId: string, to: string) {
  const villa = await prisma.villa.findUnique({ where: { id: villaId }, select: { id: true, name: true, currency: true } });
  if (!villa) throw new Error('Villa introuvable');
  const target = to.toUpperCase();
  if (villa.currency === target) return { villa: villa.name, from: villa.currency, to: target, rate: 1, extras: 0 };
  const q = await fx.quote();
  const rate = fx.rateOf(q, villa.currency, target);
  if (rate == null) throw new Error(`Taux ${villa.currency} → ${target} indisponible pour le moment`);
  const day = new Date(`${q!.date}T00:00:00.000Z`);

  const orders = await prisma.order.findMany({
    where: { OR: [{ villaId }, { villaId: null, reservation: { villaId } }] },
    include: { items: true },
  });
  await prisma.$transaction([
    ...orders.flatMap((o) => [
      prisma.order.update({
        where: { id: o.id },
        data: {
          totalAmount: r2(o.totalAmount * rate),
          commission: r2(o.commission * rate),
          // The first conversion is the one remembered (original currency and its rate).
          originalCurrency: o.originalCurrency ?? villa.currency,
          fxRate: o.fxRate ?? rate,
          fxDate: o.fxDate ?? day,
        },
      }),
      ...o.items.map((i) =>
        prisma.orderItem.update({
          where: { id: i.id },
          data: {
            unitPrice: i.unitPrice != null ? r2(i.unitPrice * rate) : null,
            unitCost: i.unitCost != null ? r2(i.unitCost * rate) : null,
            total: r2(i.total * rate),
          },
        }),
      ),
    ]),
    prisma.villa.update({ where: { id: villaId }, data: { currency: target } }),
  ]);
  return { villa: villa.name, from: villa.currency, to: target, rate, date: q!.date, extras: orders.length };
}
