import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(private readonly configService: ConfigService) {}

  async getHealthStatus(): Promise<HealthResponseDto> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: this.formatUptime(Date.now() - this.startTime),
      environment: this.getEnvSummary(),
      connections: await this.getConnectionStatus(),
      system: this.getSystemInfo(),
    };
  }

  private getEnvSummary() {
    return {
      NODE_ENV: this.configService.get('NODE_ENV', 'development'),
      PORT: this.configService.get('PORT', 3000),
      FASTAPI_URL: this.configService.get('FASTAPI_URL', 'not set'),
      DB_NAME: this.configService.get('DB_NAME', 'not set'),
      QUEUE_CONCURRENCY: this.configService.get('QUEUE_CONCURRENCY', 'not set'),
      MAX_DOCS_PER_RUN: this.configService.get('MAX_DOCS_PER_RUN', 'not set'),
      ENABLE_SWAGGER: this.configService.get('ENABLE_SWAGGER', 'not set'),
    };
  }

  private async getConnectionStatus() {
    return {
      redis: await this.checkRedis(),
    };
  }

  private async checkRedis() {
    const start = Date.now();
    let redis: Redis;
    try {
      redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD') || undefined,
        db: this.configService.get('REDIS_DB', 0),
        connectTimeout: 5000,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      return { status: 'connected', responseTime: `${Date.now() - start}ms` };
    } catch (error) {
      return { status: 'disconnected', error: (error as Error).message };
    } finally {
      if (redis) redis.disconnect();
    }
  }

  private getSystemInfo() {
    const mem = process.memoryUsage();
    return {
      memory: {
        used: this.formatBytes(mem.heapUsed),
        total: this.formatBytes(mem.heapTotal),
        rss: this.formatBytes(mem.rss),
      },
      nodeVersion: process.version,
    };
  }

  private formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  private formatBytes(bytes: number): string {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}
