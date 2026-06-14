import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppServerlessModule } from '../apps/backend/src/app.serverless.module';
import { AuthService } from '../apps/backend/src/modules/auth/auth.service';

const expressServer = express();
let isInitialized = false;

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

export default async function handler(req: any, res: any) {
  await bootstrap();
  // Strip /api prefix so NestJS controllers work the same as locally
  req.url = req.url?.replace(/^\/api/, '') || '/';
  expressServer(req, res);
}
