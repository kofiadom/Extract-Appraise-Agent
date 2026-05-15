import * as path from 'path';
import * as fs from 'fs';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsService } from '../jobs/jobs.service';
import { JOB_TYPES } from '../../types';

@Injectable()
export class PipelineService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly config: ConfigService,
  ) {}

  /** Legacy: submit all files as a single job (kept for backwards compat). */
  async runPipeline(
    userId: string,
    markdownFiles: string[],
    steps?: string[],
    fileMapping?: Record<string, string>,
  ): Promise<{ jobId: string; status: string }> {
    return this.jobsService.submitJob({
      userId,
      jobType: JOB_TYPES.PAPER_PIPELINE,
      data: { markdownFiles, steps, fileMapping: fileMapping ?? {} },
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
    steps?: string[],
    fileMapping?: Record<string, string>,
  ): Promise<{ jobId: string; fileName: string; status: string }[]> {
    const jobs = await Promise.all(
      markdownFiles.map(async (fileName) => {
        const { jobId, status } = await this.jobsService.submitJob({
          userId,
          jobType: JOB_TYPES.PAPER_PIPELINE,
          data: { markdownFiles: [fileName], steps, fileMapping: fileMapping ?? {} },
        });
        return { jobId, fileName, status };
      }),
    );
    return jobs;
  }

  /** Resolve the absolute path of the original PDF for a given pipeline job. */
  async getPipelinePdfPath(
    jobId: string,
    userId: string,
    mdFile?: string,
  ): Promise<{ filePath: string; originalName: string }> {
    const job = await this.jobsService.getJobStatus(jobId, userId);
    const inputData = (job.inputData ?? {}) as Record<string, unknown>;
    const fileMapping = (inputData.fileMapping ?? {}) as Record<string, string>;
    const markdownFiles = (inputData.markdownFiles ?? []) as string[];

    const targetMd = mdFile ?? markdownFiles[0];
    if (!targetMd) throw new NotFoundException('No files associated with this job');

    const stored = fileMapping[targetMd];
    if (!stored) throw new NotFoundException('PDF not found — this job predates PDF tracking');

    let filePath: string;
    let originalName: string;

    if (path.isAbsolute(stored)) {
      // New format: absolute path stored directly from FastAPI response
      filePath = stored;
      originalName = path.basename(stored);
    } else {
      // Legacy format: bare filename stored before absolute-path fix
      const isDocker = fs.existsSync('/.dockerenv');
      const defaultDir = isDocker
        ? '/app/tmp/papers_fs'
        : path.resolve(process.cwd(), '../tmp/papers_fs');
      const papersDir = path.resolve(this.config.get<string>('PAPERS_FS_DIR') ?? defaultDir);
      filePath = path.resolve(papersDir, stored);
      originalName = stored;
      if (!filePath.startsWith(papersDir + path.sep) && filePath !== papersDir) {
        throw new BadRequestException('Invalid file path');
      }
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('PDF file no longer exists on disk');
    }

    return { filePath, originalName };
  }

  async checkExisting(userId: string, markdownFiles: string[]) {
    return this.jobsService.findExistingByMarkdownFiles(userId, markdownFiles);
  }

  async getPipelineStatus(jobId: string, userId: string) {
    return this.jobsService.getJobStatus(jobId, userId);
  }

  async getPipelineResult(jobId: string, userId: string) {
    return this.jobsService.getJobResult(jobId, userId);
  }
}
