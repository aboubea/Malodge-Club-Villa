import { PrismaClient } from '@prisma/client';

/**
 * Test database: TEST_DATABASE_URL, emptied by the tests. Its name must contain "test",
 * so that real data can never be wiped by mistake.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL manquante : base PostgreSQL vide réservée aux tests.');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) throw new Error(`Refus : la base « ${name} » ne contient pas « test » dans son nom, elle pourrait contenir de vraies données.`);
  return url;
}

export const testDb = () => new PrismaClient({ datasourceUrl: testDatabaseUrl() });

/** Empties every table (the schema and its migration history stay). */
export async function wipe(prisma: PrismaClient) {
  const tables: { tablename: string }[] = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export const seed = {
  user: (prisma: PrismaClient, firstName: string, lastName = '', role: 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE' = 'CLIENT') =>
    prisma.user.create({ data: { email: `${uid()}@test.local`, password: 'x', firstName, lastName, role, canLogin: false } }),
  villa: (prisma: PrismaClient, name: string, currency: string, country = currency === 'MAD' ? 'Maroc' : 'France') =>
    prisma.villa.create({ data: { name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${uid()}`, address: '-', city: '-', country, currency } }),
};
