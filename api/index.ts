import * as path from 'path';

// Everything at module level is wrapped in try/catch so an init error returns
// a diagnostic 500 from the handler instead of Vercel's opaque FUNCTION_INVOCATION_FAILED.

let _require: NodeRequire | null = null;
let expressServer: any = null;
let moduleError: string | null = null;

try {
  // eval('require') is opaque to esbuild — prevents re-bundling of pre-compiled NestJS
  // dist files which would strip emitDecoratorMetadata and break DI.
  // eslint-disable-next-line no-eval
  _require = eval('require') as NodeRequire;
  // Load reflect-metadata from node_modules (not bundled) for a single global Reflect.
  _require('reflect-metadata');
  expressServer = _require('express')();
  expressServer.disable('x-powered-by');
} catch (e: any) {
  moduleError = `Module init: ${e?.message ?? String(e)}`;
  console.error('[api/index module-eval]', moduleError);
}

let isInitialized = false;
let bootstrapError: string | null = null;

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/** Browser protections on every API response (no framing, no type sniffing, HTTPS only, no caching of personal data). */
function setSecurityHeaders(res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cache-Control', 'no-store');
}

function send(res: any, status: number, body: object) {
  const json = JSON.stringify(body);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(json);
}

async function bootstrap() {
  if (!_require) throw new Error('require not available — module init failed');

  // process.cwd() is /var/task in Vercel Lambda.
  // vercel.json includeFiles ships apps/backend/dist/** to /var/task/apps/backend/dist/**.
  const distBase = path.join(process.cwd(), 'apps', 'backend', 'dist');

  let AppServerlessModule: any;
  let AuthService: any;
  let ServicesService: any;
  try {
    AppServerlessModule = _require(path.join(distBase, 'app.serverless.module')).AppServerlessModule;
    AuthService = _require(path.join(distBase, 'modules', 'auth', 'auth.service')).AuthService;
    ServicesService = _require(path.join(distBase, 'modules', 'services', 'services.service')).ServicesService;
  } catch (e: any) {
    throw new Error(`Dist load failed (cwd=${process.cwd()}): ${e?.message}`);
  }

  const { NestFactory } = _require('@nestjs/core');
  const { ExpressAdapter } = _require('@nestjs/platform-express');
  const { ValidationPipe } = _require('@nestjs/common');

  const app = await NestFactory.create(
    AppServerlessModule,
    new ExpressAdapter(expressServer),
    { logger: ['error', 'warn'] },
  );

  app.enableCors({
    origin: (_origin: string | undefined, cb: (err: null, allow: boolean) => void) => cb(null, true),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  await app.init();
  nestApp = app;

  // Schema fixes and default data run once per deployment (the first cold start
  // records it); later cold starts skip ~60 database round trips.
  const PrismaServiceV = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
  const prismaV = app.get(PrismaServiceV);
  const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '';
  let upToDate = false;
  if (version) {
    try {
      const row = await prismaV.appSetting.findUnique({ where: { key: 'bootstrap.version' } });
      upToDate = row?.value === version;
    } catch { /* table missing: run everything */ }
  }
  if (upToDate) {
    isInitialized = true;
    return;
  }

  try {
    const authService = app.get(AuthService);
    await authService.ensureSuperAdmin();
  } catch { /* non-fatal */ }

  try {
    const servicesService = app.get(ServicesService);
    await servicesService.ensureDefaultCategories();
  } catch { /* non-fatal */ }

  // The schema itself is created and changed only by the versioned migrations
  // (apps/backend/prisma/migrations, applied by the build). Only data fixes run here.
  const dataFixes = [
    // One spelling per country: Lodgify's "Morocco" is the app's "Maroc".
    `UPDATE "Villa" SET "country" = 'Maroc' WHERE lower(trim("country")) IN ('morocco', 'ma', 'maroc') AND "country" <> 'Maroc'`,
    `UPDATE "User" SET "countries" = ARRAY(SELECT DISTINCT CASE WHEN lower(trim(c)) IN ('morocco', 'ma', 'maroc') THEN 'Maroc' ELSE c END FROM unnest("countries") AS c) WHERE EXISTS (SELECT 1 FROM unnest("countries") AS c WHERE lower(trim(c)) IN ('morocco', 'ma') OR c = 'maroc')`,
    // Stay dates are calendar days (00:00 UTC): a time typed with them made the stay miss "today".
    `UPDATE "Reservation" SET "checkIn" = date_trunc('day', "checkIn") WHERE "checkIn" IS NOT NULL AND "checkIn" <> date_trunc('day', "checkIn")`,
    `UPDATE "Reservation" SET "checkOut" = date_trunc('day', "checkOut") WHERE "checkOut" IS NOT NULL AND "checkOut" <> date_trunc('day', "checkOut")`,
  ];
  for (const sql of dataFixes) {
    try {
      await prismaV.$executeRawUnsafe(sql);
    } catch (e: any) {
      console.warn('[data fix]', e?.message ?? e);
    }
  }

  if (version) {
    try {
      await prismaV.appSetting.upsert({ where: { key: 'bootstrap.version' }, update: { value: version }, create: { key: 'bootstrap.version', value: version } });
    } catch { /* non-fatal: done again at the next cold start */ }
  }

  isInitialized = true;
}

/** One bootstrap per instance, shared by the requests that arrive while it runs. */
let booting: Promise<void> | null = null;
let nestApp: any = null;

/** Database round-trip time and regions, to spot a function far from its database. */
async function dbTiming() {
  if (!nestApp || !_require) return null;
  try {
    const distBase = path.join(process.cwd(), 'apps', 'backend', 'dist');
    const prisma = nestApp.get(_require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService);
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      await prisma.$queryRawUnsafe('SELECT 1');
      times.push(Date.now() - t);
    }
    let host = '';
    try {
      host = new URL(process.env.DATABASE_URL || '').hostname;
    } catch { /* ignore */ }
    // Only the region part of the host is shown (e.g. "eu-central-1"), never the address.
    const dbRegion = host.match(/(?:aws|gcp|azure)?[.-]?((?:us|eu|ap|sa|ca|me|af)-[a-z]+-\d)/)?.[1] ?? null;
    return { dbRoundTripMs: times, functionRegion: process.env.VERCEL_REGION ?? null, dbRegion, pooled: host.includes('-pooler') };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url: string = req.url || '';

  // Health check — always responds even if bootstrap failed
  if (/^\/(api\/)?health(\?|$)/.test(url)) {
    let distExists = false;
    try {
      if (_require) {
        const distBase = path.join(process.cwd(), 'apps', 'backend', 'dist');
        _require.resolve(path.join(distBase, 'app.serverless.module'));
        distExists = true;
      }
    } catch { /* not found */ }

    send(res, 200, {
      status: moduleError || bootstrapError ? 'error' : isInitialized ? 'ok' : 'pending',
      initialized: isInitialized,
      moduleError,
      bootstrapError,
      cwd: process.cwd(),
      distExists,
      version: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
      environment: process.env.VERCEL_ENV ?? null,
      ...(url.includes('timing') || req.url?.includes('timing') ? { timing: await dbTiming() } : {}),
    });
    return;
  }

  if (moduleError || !expressServer) {
    send(res, 503, { statusCode: 503, message: 'Module init failed', error: moduleError });
    return;
  }

  if (!isInitialized) {
    bootstrapError = null;
    booting ??= bootstrap()
      .catch((err: any) => {
        bootstrapError = err?.message ?? String(err);
        console.error('[bootstrap]', bootstrapError);
      })
      .finally(() => {
        booting = null;
      });
    await booting;
  }

  if (bootstrapError) {
    send(res, 503, { statusCode: 503, message: 'Service unavailable', error: bootstrapError });
    return;
  }

  req.url = url.replace(/^\/api/, '') || '/';
  expressServer(req, res);
}
