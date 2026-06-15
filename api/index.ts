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
