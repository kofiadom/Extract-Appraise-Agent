import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { JOB_TYPES } from '../../types';

@Injectable()
export class PipelineService {
  constructor(private readonly jobsService: JobsService) {}

  /** Legacy: submit all files as a single job (kept for backwards compat). */
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

  /**
   * Submit one independent BullMQ job per markdown file.
   * Returns an array of { jobId, fileName } so the frontend can track each
   * document individually.
   */
  async runPipelineForFiles(
    userId: string,
    markdownFiles: string[],
  ): Promise<{ jobId: string; fileName: string; status: string }[]> {
    const jobs = await Promise.all(
      markdownFiles.map(async (fileName) => {
        const { jobId, status } = await this.jobsService.submitJob({
          userId,
          jobType: JOB_TYPES.PAPER_PIPELINE,
          data: { markdownFiles: [fileName] },
        });
        return { jobId, fileName, status };
      }),
    );
    return jobs;
  }

  async getPipelineStatus(jobId: string, userId: string) {
    return this.jobsService.getJobStatus(jobId, userId);
  }

  async getPipelineResult(jobId: string, userId: string) {
    return this.jobsService.getJobResult(jobId, userId);
  }
}
