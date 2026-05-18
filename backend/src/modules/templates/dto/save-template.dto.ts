import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional, MaxLength } from 'class-validator';

export class SaveTemplateDto {
  @ApiProperty({ description: 'User-assigned label for this template', example: 'Q4 Review Criteria' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'Parsed extraction template (fields array)', example: { fields: [] } })
  @IsObject()
  extractionTemplate: Record<string, unknown>;

  @ApiProperty({ description: 'Parsed appraisal template (criteria array)', example: { criteria: [] } })
  @IsObject()
  appraisalTemplate: Record<string, unknown>;

  @ApiProperty({ description: 'Original template filenames', required: false })
  @IsOptional()
  @IsObject()
  sourceFiles?: Record<string, string>;
}
