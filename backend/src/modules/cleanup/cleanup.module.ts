import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { CleanupService } from './cleanup.service';
import { CleanupController } from './cleanup.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PipelineJob])],
  controllers: [CleanupController],
  providers: [CleanupService],
})
export class CleanupModule {}
