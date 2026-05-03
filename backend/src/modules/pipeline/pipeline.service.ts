import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { JOB_TYPES } from '../../types';

@Injectable()
export class PipelineService {
  constructor(private readonly jobsService: JobsService) {}

  async runPipeline(
    userId: string,
    markdownFiles: string[],
  ): Promise<{ jobIds: string[]; status: string }> {
    // Dispatch a separate job for each document
    const jobPromises = markdownFiles.map(markdownFile =>
      this.jobsService.submitJob({
        userId,
        jobType: JOB_TYPES.PAPER_PIPELINE,
        data: { markdownFiles: [markdownFile] }, // Single file per job
      })
    );

    const results = await Promise.all(jobPromises);
    const jobIds = results.map(result => result.jobId);

    return { jobIds, status: 'queued' };
  }

  async getPipelineStatus(jobId: string, userId: string) {
    return this.jobsService.getJobStatus(jobId, userId);
  }

  async getPipelineResult(jobId: string, userId: string) {
    return this.jobsService.getJobResult(jobId, userId);
  }
}
