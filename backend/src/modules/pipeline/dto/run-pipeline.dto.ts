import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, IsIn, IsOptional } from 'class-validator';

export class RunPipelineDto {
  @ApiProperty({
    description: 'Markdown filenames returned by POST /papers/upload',
    example: ['paper1.md', 'paper2.md'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  markdownFiles: string[];

  @ApiProperty({
    description: 'Pipeline steps to run. Defaults to both extraction and appraisal.',
    example: ['extraction', 'appraisal'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['extraction', 'appraisal'], { each: true })
  steps?: string[];
}
