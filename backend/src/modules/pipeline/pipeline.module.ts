import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [JobsModule],
  controllers: [PipelineController],
  providers: [PipelineService],
})
export class PipelineModule {}
