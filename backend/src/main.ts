import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Swap NestJS default logger for structured pino JSON logs
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  // ── JWT_SECRET guard ──────────────────────────────────────────────────────
  const jwtSecret = configService.get<string>('JWT_SECRET', '');
  const defaultSecret = 'replace-with-a-long-random-secret-in-production';
  if (jwtSecret === defaultSecret || jwtSecret.length < 32) {
    if (configService.get<string>('NODE_ENV') === 'production') {
      throw new Error(
        'JWT_SECRET must be set to a strong random value in production (min 32 chars)',
      );
    }
    console.warn(
      '\n⚠️  WARNING: JWT_SECRET is weak or default. Set a strong secret before deploying.\n',
    );
  }

  // ── CORS ──────────────────────────────────────────────────────────────────
  // CORS_ORIGIN can be a single origin or comma-separated list.
  // Leave unset (or use *) to allow all origins in development.
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  app.enableCors({
    origin:
      corsOrigin === '*'
        ? true
        : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.setGlobalPrefix('api/v1');

  // ── Swagger ───────────────────────────────────────────────────────────────
  if (configService.get<string>('ENABLE_SWAGGER') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Agno RAG Backend Service')
      .setDescription('REST Evidence Extractor — NestJS job queue + API')
      .setVersion('1.0')
      .addTag('auth', 'Authentication')
      .addTag('papers', 'PDF upload')
      .addTag('pipeline', 'Extraction + appraisal pipeline')
      .addTag('exports', 'Excel / Word / JSON downloads')
      .addTag('chat', 'Document Q&A')
      .addTag('jobs', 'Generic job management')
      .addTag('health', 'Health check')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`Agno RAG Backend running on: http://localhost:${port}`);
  console.log(`API docs: http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
