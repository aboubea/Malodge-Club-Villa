import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const authService = app.get(AuthService);
  await authService.ensureSuperAdmin();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Malodge API running on port ${port}`);
}

bootstrap();
