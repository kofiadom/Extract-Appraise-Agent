import { IsArray, IsEnum, ArrayMinSize, ArrayMaxSize, IsString } from 'class-validator';

export class BulkExportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  jobIds: string[];

  @IsEnum(['excel', 'word'])
  format: 'excel' | 'word';
}
