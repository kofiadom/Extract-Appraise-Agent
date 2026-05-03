import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { HealthModule } from './modules/health/health.module';
import { FastApiModule } from './modules/fastapi/fastapi.module';
import { PapersModule } from './modules/papers/papers.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { ExportsModule } from './modules/exports/exports.module';
import { ChatModule } from './modules/chat/chat.module';
import { RedisConfigService } from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Structured JSON logging — pretty-prints in dev, raw JSON in production
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        level: process.env.LOG_LEVEL || 'info',
        autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      },
    }),

    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL) || 60,
            limit: parseInt(process.env.THROTTLE_LIMIT) || 100,
          },
        ],
      }),
    }),

    BullModule.forRootAsync({ useClass: RedisConfigService }),

    DatabaseModule,
    FastApiModule,
    AuthModule,
    UsersModule,
    JobsModule,
    ProcessingModule,
    PapersModule,
    PipelineModule,
    ExportsModule,
    ChatModule,
    HealthModule,
  ],
  providers: [
    RedisConfigService,
    // Apply ThrottlerGuard globally — all routes are rate-limited when ENABLE_THROTTLING=true.
    // Use @SkipThrottle() on endpoints that should bypass (e.g. health checks).
    ...(process.env.ENABLE_THROTTLING === 'true'
      ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
      : []),
  ],
})
export class AppModule {}
