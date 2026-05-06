import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class CheckExistingDto {
  @ApiProperty({
    description: 'Markdown filenames returned by POST /papers/upload',
    example: ['user_paper1.md'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  markdownFiles: string[];
}
