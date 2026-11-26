/**
 * Catalogue tidy-up: one category per theme and no duplicate services.
 *
 * Categories are mapped onto a reference list (the application's original
 * categories plus the spreadsheet's distinct themes); a duplicate service
 * (same name and currency) is merged into the one most used. Orders, villa
 * services and provider links follow the record that is kept, so no data is lost.
 */
import { PrismaClient } from '@prisma/client';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bet\b/g, '&')
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Reference categories, with the spellings that belong to each. */
const CANONICAL: { name: string; match: RegExp }[] = [
  { name: 'Transport & Transfert', match: /^(transports?|transferts?|navettes?|chauffeurs?)\b/ },
  { name: 'Bien-être & Spa', match: /^(bien etre|soins?|spa|massages?|beaute)\b/ },
  { name: 'Activités & Loisirs', match: /^(activites?|loisirs?)\b/ },
  { name: 'Excursions', match: /^(excursions?|circuits?|visites?)\b/ },
  { name: 'Location de voiture', match: /^(locations? (de )?(voitures?|vehicules?)|location auto)\b/ },
  { name: 'Restauration & Traiteur', match: /^(restauration|traiteurs?|chefs?|repas)\b/ },
  { name: 'Ménage & Entretien', match: /^(menage|entretien|nettoyage)\b/ },
  { name: 'Maintenance Technique', match: /^(maintenance|technique|reparations?)\b/ },
  { name: 'Sécurité & Gardiennage', match: /^(securite|gardiennage)\b/ },
  { name: 'Conciergerie', match: /^conciergerie\b/ },
];

/** The reference category a category name belongs to (itself when none applies). */
export function canonicalCategoryName(name: string): string {
  const n = norm(name);
  return CANONICAL.find((c) => c.match.test(n))?.name ?? name.trim();
}

/** Same service whatever the spacing, punctuation or "personnes"/"pers." spelling. */
const serviceKey = (name: string, currency: string) =>
  `${currency}|${norm(name)
    .replace(/\bpersonnes?\b/g, 'pers')
    .replace(/\bheures?\b/g, 'h')
    .replace(/\s+/g, '')}`;

export interface CleanupReport {
  dryRun: boolean;
  categories: { before: number; after: number; merges: { into: string; from: string[]; services: number }[]; renamed: { from: string; to: string }[] };
  services: { before: number; after: number; merges: { name: string; duplicates: number; ordersMoved: number }[] };
}

class Rollback extends Error {}

export async function cleanupCatalogue(prisma: PrismaClient, opts: { dryRun: boolean }): Promise<CleanupReport> {
  let report!: CleanupReport;
  try {
    await prisma.$transaction(
      async (tx) => {
        const categories = await tx.serviceCategory.findMany({ select: { id: true, name: true, _count: { select: { services: true } } } });
        report = {
          dryRun: opts.dryRun,
          categories: { before: categories.length, after: 0, merges: [], renamed: [] },
          services: { before: await tx.service.count(), after: 0, merges: [] },
        };

        /* ── Categories ── */
        const groups = new Map<string, typeof categories>();
        for (const c of categories) {
          const canon = canonicalCategoryName(c.name);
          const k = norm(canon);
          groups.set(k, [...(groups.get(k) ?? []), c]);
        }
        for (const [, group] of groups) {
          const canon = canonicalCategoryName(group[0].name);
          // Keep the category already named as the reference, otherwise the most used one.
          const keeper =
            group.find((c) => norm(c.name) === norm(canon)) ??
            [...group].sort((a, b) => b._count.services - a._count.services)[0];
          const others = group.filter((c) => c.id !== keeper.id);
          if (others.length) {
            const ids = others.map((o) => o.id);
            const moved = await tx.service.updateMany({ where: { categoryId: { in: ids } }, data: { categoryId: keeper.id } });
            const kept = (await tx.providerCategory.findMany({ where: { categoryId: keeper.id }, select: { providerId: true } })).map((p) => p.providerId);
            await tx.providerCategory.updateMany({
              where: { categoryId: { in: ids }, providerId: { notIn: kept.length ? kept : ['__none__'] } },
              data: { categoryId: keeper.id },
            });
            await tx.providerCategory.deleteMany({ where: { categoryId: { in: ids } } });
            await tx.serviceCategory.deleteMany({ where: { id: { in: ids } } });
            report.categories.merges.push({ into: canon, from: others.map((o) => o.name), services: moved.count });
          }
          if (keeper.name !== canon) {
            await tx.serviceCategory.update({ where: { id: keeper.id }, data: { name: canon } });
            report.categories.renamed.push({ from: keeper.name, to: canon });
          }
        }
        report.categories.after = await tx.serviceCategory.count();

        /* ── Services ── */
        const services = await tx.service.findMany({
          select: {
            id: true, name: true, currency: true, createdAt: true, unitCost: true, publicPrice: true, unit: true, defaultProviderId: true, description: true,
            _count: { select: { orderItems: true } },
          },
          orderBy: { createdAt: 'asc' },
        });
        const byKey = new Map<string, typeof services>();
        for (const s of services) byKey.set(serviceKey(s.name, s.currency), [...(byKey.get(serviceKey(s.name, s.currency)) ?? []), s]);
        for (const [, group] of byKey) {
          if (group.length < 2) continue;
          const keeper = [...group].sort((a, b) => b._count.orderItems - a._count.orderItems || a.createdAt.getTime() - b.createdAt.getTime())[0];
          const dups = group.filter((s) => s.id !== keeper.id);
          const ids = dups.map((d) => d.id);
          const orders = await tx.orderItem.updateMany({ where: { serviceId: { in: ids } }, data: { serviceId: keeper.id } });
          const villas = (await tx.villaService.findMany({ where: { serviceId: keeper.id }, select: { villaId: true } })).map((v) => v.villaId);
          await tx.villaService.updateMany({ where: { serviceId: { in: ids }, villaId: { notIn: villas.length ? villas : ['__none__'] } }, data: { serviceId: keeper.id } });
          await tx.villaService.deleteMany({ where: { serviceId: { in: ids } } });
          const providers = (await tx.serviceProvider.findMany({ where: { serviceId: keeper.id }, select: { providerId: true } })).map((p) => p.providerId);
          await tx.serviceProvider.updateMany({ where: { serviceId: { in: ids }, providerId: { notIn: providers.length ? providers : ['__none__'] } }, data: { serviceId: keeper.id } });
          await tx.serviceProvider.deleteMany({ where: { serviceId: { in: ids } } });
          // Fill what the kept record lacks from its duplicates.
          const fill = (f: 'unitCost' | 'publicPrice' | 'unit' | 'defaultProviderId' | 'description') =>
            keeper[f] ?? dups.map((d) => d[f]).find((v) => v !== null && v !== undefined && v !== '') ?? null;
          // The most used record is kept, under the name of the original (oldest) entry.
          const originalName = group[0].name.trim();
          await tx.service.update({
            where: { id: keeper.id },
            data: { name: originalName, unitCost: fill('unitCost') as number | null, publicPrice: fill('publicPrice') as number | null, unit: fill('unit') as string | null, defaultProviderId: fill('defaultProviderId') as string | null, description: fill('description') as string | null },
          });
          await tx.service.deleteMany({ where: { id: { in: ids } } });
          report.services.merges.push({ name: originalName, duplicates: dups.length, ordersMoved: orders.count });
        }
        report.services.after = await tx.service.count();

        if (opts.dryRun) throw new Rollback();
      },
      { maxWait: 10_000, timeout: 25_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return report;
}
