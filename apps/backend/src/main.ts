import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';

async function bootstrap() {
  // The schema is updated by the versioned migrations (scripts/migrate.js, run by
  // start:prod and the Vercel build), never by `db push`, which can drop data.
  const app = await NestFactory.create(AppModule);
  // Same browser protections as the serverless entry (api/index.ts).
  const http = app.getHttpAdapter().getInstance();
  http.disable('x-powered-by');
  http.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      // allow requests with no origin (mobile, curl, Postman)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.some((o) => origin.startsWith(o)) ||
        /\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Malodge Club Villa API')
    .setDescription('Premium villa concierge management platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Health check endpoint for Railway/Render
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: any) => res.json({ status: 'ok' }));

  const authService = app.get(AuthService);
  await authService.ensureSuperAdmin();

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Malodge API running on port ${port}`);
}

bootstrap();
