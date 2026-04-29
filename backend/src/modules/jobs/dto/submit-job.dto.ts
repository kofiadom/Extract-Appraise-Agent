import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsObject } from 'class-validator';

export class SubmitJobDto {
  @ApiPropertyOptional({
    description: 'Arbitrary job payload data',
    example: { key: 'value' },
  })
  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
