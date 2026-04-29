import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

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
}
