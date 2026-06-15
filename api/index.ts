import * as path from 'path';

// All third-party and dist modules are loaded at runtime via eval('require').
// esbuild (Vercel's function compiler) would re-bundle imported files and strip
// emitDecoratorMetadata, breaking NestJS DI. eval('require') is opaque to esbuild
// so it is left as a runtime require that resolves from node_modules as-is.
// eslint-disable-next-line no-eval
const _require: NodeRequire = eval('require');

// Load reflect-metadata from node_modules so there is a single global Reflect
// instance shared with the pre-compiled NestJS dist files (not a bundled copy).
_require('reflect-metadata');

const express = _require('express');
const expressServer = express();
let isInitialized = false;
let bootstrapError: string | null = null;

// In Vercel Lambda, process.cwd() is /var/task.
// vercel.json includeFiles ships apps/backend/dist/** to /var/task/apps/backend/dist/**.
function dist(mod: string): string {
  return path.join(process.cwd(), 'apps/backend/dist', mod);
}

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
  let AppServerlessModule: any;
  let AuthService: any;
  try {
    AppServerlessModule = _require(dist('app.serverless.module')).AppServerlessModule;
    AuthService = _require(dist('modules/auth/auth.service')).AuthService;
  } catch (e: any) {
    throw new Error(`Module load failed: ${e?.message}`);
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

  if (url === '/api/health' || url === '/health') {
    send(res, 200, {
      status: 'ok',
      initialized: isInitialized,
      error: bootstrapError,
      cwd: process.cwd(),
      distExists: (() => { try { _require.resolve(dist('app.serverless.module')); return true; } catch { return false; } })(),
    });
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
