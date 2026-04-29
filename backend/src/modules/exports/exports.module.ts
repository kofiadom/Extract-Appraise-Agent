import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExcelGenerator } from './generators/excel.generator';
import { DocxGenerator } from './generators/docx.generator';

@Module({
  imports: [TypeOrmModule.forFeature([PipelineJob])],
  controllers: [ExportsController],
  providers: [ExportsService, ExcelGenerator, DocxGenerator],
})
export class ExportsModule {}
