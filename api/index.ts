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

  try {
    const authService = app.get(AuthService);
    await authService.ensureSuperAdmin();
  } catch { /* non-fatal */ }

  try {
    const PrismaService = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS countries TEXT[] DEFAULT '{}'`);
  } catch { /* non-fatal — column may already exist */ }

  try {
    const servicesService = app.get(ServicesService);
    await servicesService.ensureDefaultCategories();
  } catch { /* non-fatal */ }

  try {
    const PrismaService1b = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
    const prisma1b = app.get(PrismaService1b);
    await prisma1b.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerStatus" TEXT DEFAULT 'PENDING'`);
  } catch { /* non-fatal */ }

  try {
    const PrismaService3 = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
    const prisma3 = app.get(PrismaService3);
    await prisma3.$executeRawUnsafe(`ALTER TABLE "VillaService" ADD COLUMN IF NOT EXISTS "commissionTo" TEXT DEFAULT 'manager'`);
    await prisma3.$executeRawUnsafe(`ALTER TABLE "VillaService" ADD COLUMN IF NOT EXISTS "ownerShare" FLOAT DEFAULT 50`);
  } catch { /* non-fatal */ }

  try {
    const PrismaService4 = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
    const prisma4 = app.get(PrismaService4);
    await prisma4.$executeRawUnsafe(`ALTER TABLE "Villa" ADD COLUMN IF NOT EXISTS "customFields" JSONB DEFAULT '[]'`);
  } catch { /* non-fatal */ }

  // Extras tracking schema (idempotent). Each statement runs on its own so one
  // failure never blocks the others.
  try {
    const PrismaServiceX = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
    const prismaX = app.get(PrismaServiceX);
    const onceType = (name: string, values: string) =>
      `DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${values}); EXCEPTION WHEN duplicate_object THEN null; END $$;`;
    const onceFk = (table: string, name: string, sql: string) =>
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${sql}; END IF; END $$;`;
    const statements = [
      onceType('CommissionBase', `'MALODGE_MARGIN', 'TOTAL_MARGIN'`),
      onceType('SettlementKind', `'CLIENT_PAYMENT', 'CLIENT_REFUND', 'PROVIDER_PAYMENT', 'PROVIDER_REFUND', 'OWNER_PAYOUT', 'OWNER_REFUND', 'EMPLOYEE_PAYOUT', 'EMPLOYEE_REFUND'`),
      onceType('SettlementStatus', `'PENDING', 'VALIDATED', 'CANCELLED'`),
      `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER'`,
      `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'EMPLOYEE'`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canLogin" BOOLEAN NOT NULL DEFAULT true`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionBase" "CommissionBase"`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
      `ALTER TABLE "Villa" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EUR'`,
      `ALTER TABLE "Villa" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
      `ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EUR'`,
      `ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "defaultProviderId" TEXT`,
      `ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "publicPrice" DOUBLE PRECISION`,
      `ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "unit" TEXT`,
      `ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION`,
      `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "label" TEXT`,
      `ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "datesEstimated" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sellerId" TEXT`,
      `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "label" TEXT`,
      `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION`,
      `ALTER TABLE "OrderItem" ALTER COLUMN "serviceId" DROP NOT NULL`,
      `ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" DROP NOT NULL`,
      `ALTER TABLE "OrderItem" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION`,
      `ALTER TABLE "OrderItem" ALTER COLUMN "quantity" SET DEFAULT 1`,
      `CREATE TABLE IF NOT EXISTS "Settlement" (
        "id" TEXT NOT NULL,
        "kind" "SettlementKind" NOT NULL,
        "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
        "personId" TEXT NOT NULL,
        "reservationId" TEXT,
        "date" TIMESTAMP(3),
        "amount" DOUBLE PRECISION NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'EUR',
        "method" "PaymentMethod",
        "reference" TEXT,
        "note" TEXT,
        "createdById" TEXT,
        "validatedById" TEXT,
        "validatedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX IF NOT EXISTS "Settlement_personId_idx" ON "Settlement"("personId")`,
      `CREATE INDEX IF NOT EXISTS "Settlement_status_idx" ON "Settlement"("status")`,
      onceFk('Villa', 'Villa_ownerId_fkey', `FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
      onceFk('Service', 'Service_defaultProviderId_fkey', `FOREIGN KEY ("defaultProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
      onceFk('Order', 'Order_sellerId_fkey', `FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
      onceFk('Settlement', 'Settlement_personId_fkey', `FOREIGN KEY ("personId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`),
      onceFk('Settlement', 'Settlement_reservationId_fkey', `FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
      onceFk('Settlement', 'Settlement_createdById_fkey', `FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
      onceFk('Settlement', 'Settlement_validatedById_fkey', `FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
    ];
    for (const sql of statements) {
      try {
        await prismaX.$executeRawUnsafe(sql);
      } catch (e: any) {
        console.warn('[extras schema]', e?.message ?? e);
      }
    }
  } catch { /* non-fatal */ }

  try {
    const PrismaService2 = _require(path.join(distBase, 'prisma', 'prisma.service')).PrismaService;
    const prisma2 = app.get(PrismaService2);
    await prisma2.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CalendarEvent" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "startAt" TIMESTAMP(3) NOT NULL,
        "endAt" TIMESTAMP(3) NOT NULL,
        "allDay" BOOLEAN NOT NULL DEFAULT false,
        "type" TEXT NOT NULL DEFAULT 'event',
        "color" TEXT,
        "villaId" TEXT,
        "reservationId" TEXT,
        "orderId" TEXT,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
      )
    `);
  } catch { /* non-fatal — table may already exist */ }

  isInitialized = true;
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url: string = req.url || '';

  // Health check — always responds even if bootstrap failed
  if (url === '/api/health' || url === '/health') {
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
    });
    return;
  }

  if (moduleError || !expressServer) {
    send(res, 503, { statusCode: 503, message: 'Module init failed', error: moduleError });
    return;
  }

  if (!isInitialized) {
    bootstrapError = null;
    try {
      await bootstrap();
    } catch (err: any) {
      bootstrapError = err?.message ?? String(err);
      console.error('[bootstrap]', bootstrapError);
    }
  }

  if (bootstrapError) {
    send(res, 503, { statusCode: 503, message: 'Service unavailable', error: bootstrapError });
    return;
  }

  req.url = url.replace(/^\/api/, '') || '/';
  expressServer(req, res);
}
