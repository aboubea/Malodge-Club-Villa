#!/usr/bin/env node
/**
 * Brings the database schema up to date with the versioned migrations (prisma/migrations).
 *
 * This replaces `prisma db push --accept-data-loss`, which aligned the database on
 * schema.prisma by any means, dropping a removed or renamed column with its data.
 * A migration only runs the SQL of its file, which is committed and reviewed.
 *
 *  1. A database created before migrations existed (tables, no migration history):
 *     the baseline 0_init, which describes that schema, is recorded as applied.
 *  2. `prisma migrate deploy` applies the migrations not applied yet, in order.
 *  3. Drift check: if the database still lacks a table, column or enum value that
 *     schema.prisma declares, schema.prisma was changed without a migration and the
 *     code would fail at runtime: the build stops with how to fix it.
 *
 * Migrations run on a direct connection (Neon's pooler cannot hold the migration lock).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const schema = path.join(root, 'prisma', 'schema.prisma');
const BASELINE = '0_init';

const log = (...a) => console.log('[migrate]', ...a);
const fail = (msg) => {
  console.error(`\n[migrate] ÉCHEC : ${msg}\n`);
  process.exit(1);
};

/** Host without Neon's "-pooler" suffix: the same database, directly. */
const directHost = (host) => host.replace('-pooler.', '.');

function directUrl(databaseUrl) {
  let derived = databaseUrl;
  let base;
  try {
    const u = new URL(databaseUrl);
    u.hostname = directHost(u.hostname);
    u.searchParams.delete('pgbouncer');
    derived = u.toString();
    base = u.hostname;
  } catch {
    return databaseUrl;
  }
  // An explicit direct URL is used only if it targets the same database as DATABASE_URL:
  // a stale one must never send the migrations of a preview to another database.
  for (const name of ['DIRECT_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING']) {
    const v = process.env[name];
    if (!v) continue;
    try {
      const u = new URL(v);
      if (directHost(u.hostname) === base && u.pathname === new URL(databaseUrl).pathname) return v;
      log(`${name} ignorée : elle ne vise pas la même base que DATABASE_URL.`);
    } catch {
      /* ignore malformed */
    }
  }
  return derived;
}

function prisma(args, url, { capture = false, withSchema = true } = {}) {
  const bin = require.resolve('prisma/build/index.js', { paths: [root] });
  const r = spawnSync(process.execPath, [bin, ...args, ...(withSchema ? ['--schema', schema] : [])], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return r;
}

async function dbState(url) {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const [row] = await db.$queryRawUnsafe(
      `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "hasHistory", to_regclass('public."User"') IS NOT NULL AS "hasTables"`,
    );
    let hasBaseline = false;
    if (row.hasHistory) {
      const rows = await db.$queryRawUnsafe(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`, BASELINE);
      hasBaseline = rows.length > 0;
    }
    return { hasTables: row.hasTables, hasHistory: row.hasHistory, hasBaseline };
  } finally {
    await db.$disconnect();
  }
}

/** Statements that add what the code expects: if any remains, the code would break. */
const MISSING = /\bCREATE TABLE\b|\bADD COLUMN\b|\bCREATE TYPE\b|\bADD VALUE\b|\bDROP NOT NULL\b/i;

function driftCheck(url) {
  const r = prisma(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', schema, '--script'], url, { capture: true, withSchema: false });
  if (r.status !== 0) {
    log('Vérification de dérive impossible (ignorée) :', (r.stderr || '').trim().split('\n').pop());
    return;
  }
  const statements = r.stdout
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter(Boolean);
  if (!statements.length) {
    log('Schéma de la base conforme à schema.prisma.');
    return;
  }
  const missing = statements.filter((s) => MISSING.test(s));
  if (missing.length) {
    fail(
      `schema.prisma déclare des éléments absents de la base, sans migration pour les créer :\n\n${missing.join(';\n')};\n\n` +
        `Créez la migration en local puis commitez-la :\n  npm run db:migration:new --workspace=apps/backend -- <nom_de_la_migration>`,
    );
  }
  log(`Écarts sans risque pour le code (non appliqués, à traiter par une migration si voulu) :\n${statements.join(';\n')};`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.SKIP_DB_MIGRATIONS === '1') return log('SKIP_DB_MIGRATIONS=1 : migrations non appliquées.');
  if (!databaseUrl) return log('Pas de DATABASE_URL : migrations non appliquées.');
  const url = directUrl(databaseUrl);

  const state = await dbState(url);
  if (state.hasTables && !state.hasBaseline) {
    log(`Base existante sans historique de migrations : ${BASELINE} enregistrée comme déjà appliquée.`);
    const r = prisma(['migrate', 'resolve', '--applied', BASELINE], url);
    if (r.status !== 0) fail(`impossible d'enregistrer la migration de base ${BASELINE}.`);
  }

  const r = prisma(['migrate', 'deploy'], url);
  if (r.status !== 0) fail('une migration a échoué (voir ci-dessus). Rien d’autre n’a été modifié après elle.');

  driftCheck(url);
}

main().catch((e) => fail(e?.message ?? String(e)));
