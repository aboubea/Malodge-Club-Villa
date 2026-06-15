import 'reflect-metadata';
import * as express from 'express';

// eval('require') is opaque to esbuild's static analysis, so it won't
// re-bundle our tsc-compiled NestJS dist files. If esbuild bundled them
// it would strip emitDecoratorMetadata and break NestJS DI entirely.
// The dist files are shipped via vercel.json includeFiles instead.
// eslint-disable-next-line no-eval
const _require: NodeRequire = eval('require');

const expressServer = express();
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
  let AppServerlessModule: any;
  let AuthService: any;
  try {
    AppServerlessModule = _require('../apps/backend/dist/app.serverless.module').AppServerlessModule;
    AuthService = _require('../apps/backend/dist/modules/auth/auth.service').AuthService;
  } catch (e: any) {
    throw new Error(`Module load failed: ${e?.message}`);
  }

  const { NestFactory } = await import('@nestjs/core');
  const { ExpressAdapter } = await import('@nestjs/platform-express');
  const { ValidationPipe } = await import('@nestjs/common');

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
    send(res, 200, { status: 'ok', initialized: isInitialized, error: bootstrapError });
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
