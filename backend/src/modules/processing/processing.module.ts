import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackgroundJobProcessor } from './processors/background-job.processor';
import { ProcessingService } from './services/processing.service';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { IndexedDocument } from '../../entities/indexed-document.entity';
import { QUEUE_NAMES } from '../../types';

// Read from env so JOB_TIMEOUT in .env is actually respected.
// Default: 600 000 ms (10 minutes) — enough for large multi-paper pipelines.
const JOB_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT ?? '600000', 10);

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.BACKGROUND_JOBS,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        timeout: JOB_TIMEOUT_MS,
      },
    }),
    TypeOrmModule.forFeature([PipelineJob, IndexedDocument]),
  ],
  providers: [ProcessingService, BackgroundJobProcessor],
  exports: [ProcessingService],
})
export class ProcessingModule {}
