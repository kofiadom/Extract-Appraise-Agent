import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobStatusDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  jobId: string;

  @ApiProperty({ enum: ['waiting', 'active', 'completed', 'failed', 'delayed'] })
  status: string;

  @ApiProperty({ example: 50, description: 'Progress percentage (0–100)' })
  progress: number;

  @ApiPropertyOptional({ description: 'Job result payload when completed' })
  result?: unknown;

  @ApiPropertyOptional({ description: 'Error message if the job failed' })
  error?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
