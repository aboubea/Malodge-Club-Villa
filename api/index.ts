import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
// Import from pre-compiled dist so that tsc emitDecoratorMetadata is preserved.
// esbuild (Vercel's function builder) does NOT support emitDecoratorMetadata,
// which would break NestJS DI if we imported from TypeScript source directly.
import { AppServerlessModule } from '../apps/backend/dist/app.serverless.module';
import { AuthService } from '../apps/backend/dist/modules/auth/auth.service';

const expressServer = express();
let isInitialized = false;
let bootstrapError: Error | null = null;

async function bootstrap() {
  if (isInitialized) return;

  const app = await NestFactory.create(
    AppServerlessModule,
    new ExpressAdapter(expressServer),
    { logger: ['error', 'warn'] },
  );

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: null, allow: boolean) => void) => {
      cb(null, true);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  await app.init();

  // Seed superadmin on first cold start
  try {
    const authService = app.get(AuthService);
    await authService.ensureSuperAdmin();
  } catch {}

  isInitialized = true;
}

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default async function handler(req: any, res: any) {
  setCors(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Quick health check — always responds even if bootstrap hasn't run
  const url: string = req.url || '';
  if (url === '/api/health' || url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', initialized: isInitialized, error: bootstrapError?.message ?? null }));
    return;
  }

  // Bootstrap NestJS once per cold start (retry if previous attempt failed)
  if (!isInitialized) {
    bootstrapError = null;
    try {
      await bootstrap();
    } catch (err: any) {
      bootstrapError = err;
    }
  }

  if (bootstrapError) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ statusCode: 503, message: 'Service unavailable', error: bootstrapError.message }));
    return;
  }

  // Strip /api prefix so NestJS controllers work the same as locally
  req.url = url.replace(/^\/api/, '') || '/';
  expressServer(req, res);
}
