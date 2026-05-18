import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { TemplatesModule } from '../templates/templates.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { FastApiModule } from '../fastapi/fastapi.module';

@Module({
  imports: [JobsModule, TemplatesModule, FastApiModule],
  controllers: [PipelineController],
  providers: [PipelineService],
})
export class PipelineModule {}
