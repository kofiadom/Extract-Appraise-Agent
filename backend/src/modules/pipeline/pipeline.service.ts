import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { JOB_TYPES } from '../../types';

@Injectable()
export class PipelineService {
  constructor(private readonly jobsService: JobsService) {}

  async runPipeline(
    userId: string,
    markdownFiles: string[],
  ): Promise<{ jobId: string; status: string }> {
    return this.jobsService.submitJob({
      userId,
      jobType: JOB_TYPES.PAPER_PIPELINE,
      data: { markdownFiles },
    });
  }

  async getPipelineStatus(jobId: string, userId: string) {
    return this.jobsService.getJobStatus(jobId, userId);
  }

  async getPipelineResult(jobId: string, userId: string) {
    return this.jobsService.getJobResult(jobId, userId);
  }
}
