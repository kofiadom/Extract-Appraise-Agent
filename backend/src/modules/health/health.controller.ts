import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import { HealthResponseDto } from './dto/health-response.dto';

@SkipThrottle()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check — Redis connectivity, uptime, env summary' })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while retrieving health status',
  })
  async getHealth(): Promise<HealthResponseDto> {
    return await this.healthService.getHealthStatus();
  }
}
