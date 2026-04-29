import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { QUEUE_NAMES } from '../../types';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.BACKGROUND_JOBS }),
    TypeOrmModule.forFeature([PipelineJob]),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
