import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackgroundJobProcessor } from './processors/background-job.processor';
import { ProcessingService } from './services/processing.service';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { IndexedDocument } from '../../entities/indexed-document.entity';
import { QUEUE_NAMES } from '../../types';

// Bull's timeout must exceed the processor polling windows, otherwise Bull can
// fail a healthy long-running job before the processor timeout is reached.
const PIPELINE_MAX_WAIT_MS = parseInt(process.env.PIPELINE_MAX_WAIT_MS ?? `${15 * 60 * 1000}`, 10);
const INDEX_MAX_WAIT_MS = parseInt(process.env.INDEX_MAX_WAIT_MS ?? `${5 * 60 * 1000}`, 10);
const CONFIGURED_JOB_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT ?? '0', 10);
const JOB_TIMEOUT_MS = Math.max(
  CONFIGURED_JOB_TIMEOUT_MS,
  PIPELINE_MAX_WAIT_MS + 60_000,
  INDEX_MAX_WAIT_MS + 60_000,
);

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
