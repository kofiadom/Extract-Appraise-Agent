import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnvironmentVariablesDto {
  @ApiProperty({ example: 'development' })
  NODE_ENV: string;

  @ApiProperty({ example: 3000 })
  PORT: number;

  @ApiProperty({ example: 'http://localhost:8000' })
  FASTAPI_URL: string;

  @ApiProperty({ example: 'agno_rag' })
  DB_NAME: string;

  @ApiProperty({ example: '5' })
  QUEUE_CONCURRENCY: string;

  @ApiProperty({ example: '5' })
  MAX_DOCS_PER_RUN: string;

  @ApiProperty({ example: 'true' })
  ENABLE_SWAGGER: string;
}

export class RedisConnectionDto {
  @ApiProperty({ example: 'connected' })
  status: string;

  @ApiPropertyOptional({ example: '2ms' })
  responseTime?: string;

  @ApiPropertyOptional()
  error?: string;
}

export class ConnectionsDto {
  @ApiProperty({ type: RedisConnectionDto })
  redis: RedisConnectionDto;
}

export class MemoryDto {
  @ApiProperty({ example: '45.2 MB' })
  used: string;

  @ApiProperty({ example: '128.0 MB' })
  total: string;

  @ApiProperty({ example: '95.4 MB' })
  rss: string;
}

export class SystemDto {
  @ApiProperty({ type: MemoryDto })
  memory: MemoryDto;

  @ApiProperty({ example: 'v20.11.0' })
  nodeVersion: string;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'healthy' })
  status: string;

  @ApiProperty({ example: '2025-01-15T12:39:00Z' })
  timestamp: string;

  @ApiProperty({ example: '2h 15m 30s' })
  uptime: string;

  @ApiProperty({ type: EnvironmentVariablesDto })
  environment: EnvironmentVariablesDto;

  @ApiProperty({ type: ConnectionsDto })
  connections: ConnectionsDto;

  @ApiProperty({ type: SystemDto })
  system: SystemDto;
}
