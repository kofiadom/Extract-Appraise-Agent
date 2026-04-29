import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { PipelineJob } from '../../../entities/pipeline-job.entity';
import { IndexedDocument } from '../../../entities/indexed-document.entity';
import { JobPayload, JobResult, QUEUE_NAMES, JOB_TYPES } from '../../../types';
import { FastApiService } from '../../fastapi/fastapi.service';

@Processor(QUEUE_NAMES.BACKGROUND_JOBS)
export class BackgroundJobProcessor {
  private readonly logger = new Logger(BackgroundJobProcessor.name);

  constructor(
    @InjectRepository(PipelineJob)
    private readonly jobRepo: Repository<PipelineJob>,
    @InjectRepository(IndexedDocument)
    private readonly docRepo: Repository<IndexedDocument>,
    private readonly fastApi: FastApiService,
  ) {}

  // ─── Generic stub ─────────────────────────────────────────────────────────

  @Process(JOB_TYPES.BACKGROUND_JOB)
  async process(job: Job<JobPayload>): Promise<JobResult> {
    const startTime = Date.now();
    const { jobId, data } = job.data;

    this.logger.log(`Processing generic job ${jobId}`);
    await this.jobRepo.update(jobId, { status: 'active', progress: 10 });

    try {
      await job.progress(100);
      await this.jobRepo.update(jobId, {
        status: 'completed',
        progress: 100,
        result: data as Record<string, unknown>,
      });
      return { success: true, data, processingTime: Date.now() - startTime };
    } catch (error) {
      const err = error as Error;
      await this.jobRepo.update(jobId, { status: 'failed', error: err.message });
      return { success: false, error: err.message, processingTime: Date.now() - startTime };
    }
  }

  // ─── Paper pipeline (extraction + appraisal) ──────────────────────────────

  @Process(JOB_TYPES.PAPER_PIPELINE)
  async processPaperPipeline(job: Job<JobPayload>): Promise<JobResult> {
    const startTime = Date.now();
    const { jobId, userId, data } = job.data;
    const markdownFiles = data.markdownFiles as string[];

    this.logger.log(`Processing paper pipeline ${jobId} — ${markdownFiles.length} file(s)`);
    await this.jobRepo.update(jobId, { status: 'active', progress: 10 });

    try {
      const fastapiJobId = await this.fastApi.startPipeline(markdownFiles, userId ?? '', jobId);
      this.logger.log(`FastAPI pipeline started: ${fastapiJobId} (NestJS job: ${jobId})`);
      await this.jobRepo.update(jobId, { progress: 20 });

      const result = await this.pollPipelineUntilDone(fastapiJobId, jobId, job);

      await this.jobRepo.update(jobId, { status: 'completed', progress: 100, result });
      this.logger.log(`Paper pipeline ${jobId} completed in ${Date.now() - startTime}ms`);
      return { success: true, data: result, processingTime: Date.now() - startTime };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Paper pipeline ${jobId} failed: ${err.message}`);
      await this.jobRepo.update(jobId, { status: 'failed', error: err.message });
      return { success: false, error: err.message, processingTime: Date.now() - startTime };
    }
  }

  private async pollPipelineUntilDone(
    fastapiJobId: string,
    nestJobId: string,
    bullJob: Job,
  ): Promise<Record<string, unknown>> {
    const maxWait = 9 * 60 * 1000;
    const pollInterval = 5_000;
    const deadline = Date.now() + maxWait;
    let progress = 20;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const { status, result } = await this.fastApi.pollPipeline(fastapiJobId);
      if (status === 'done' && result) return result;
      if (status === 'error') throw new Error(`FastAPI pipeline ${fastapiJobId} reported error`);
      progress = Math.min(90, progress + 5);
      await bullJob.progress(progress);
      await this.jobRepo.update(nestJobId, { progress });
    }
    throw new Error(`Pipeline timed out after ${9 * 60}s`);
  }

  // ─── Document indexing ─────────────────────────────────────────────────────

  @Process(JOB_TYPES.DOCUMENT_INDEXING)
  async processDocumentIndexing(job: Job<JobPayload>): Promise<JobResult> {
    const startTime = Date.now();
    const { jobId, userId, data } = job.data;
    const fastapiJobId = data.fastapiJobId as string;
    const fileName = data.fileName as string;

    this.logger.log(`Processing document indexing ${jobId} — file: ${fileName}`);
    await this.jobRepo.update(jobId, { status: 'active', progress: 10 });

    try {
      const result = await this.pollIndexUntilDone(fastapiJobId, jobId, job);

      // Persist indexed document record for the user
      await this.docRepo.save({
        userId,
        docId: result.doc_id,
        fileName: result.doc_name ?? fileName,
        pageCount: result.page_count ?? null,
      });

      await this.jobRepo.update(jobId, {
        status: 'completed',
        progress: 100,
        result: result as unknown as Record<string, unknown>,
      });

      this.logger.log(`Document indexing ${jobId} completed — docId: ${result.doc_id}`);
      return { success: true, data: result, processingTime: Date.now() - startTime };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Document indexing ${jobId} failed: ${err.message}`);
      await this.jobRepo.update(jobId, { status: 'failed', error: err.message });
      return { success: false, error: err.message, processingTime: Date.now() - startTime };
    }
  }

  private async pollIndexUntilDone(
    fastapiJobId: string,
    nestJobId: string,
    bullJob: Job,
  ) {
    const maxWait = 5 * 60 * 1000; // indexing is faster than pipeline — 5 min cap
    const pollInterval = 4_000;
    const deadline = Date.now() + maxWait;
    let progress = 10;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const { status, result } = await this.fastApi.pollIndexJob(fastapiJobId);
      if (status === 'done' && result) return result;
      if (status === 'error') throw new Error(`FastAPI indexing ${fastapiJobId} reported error`);
      progress = Math.min(85, progress + 10);
      await bullJob.progress(progress);
      await this.jobRepo.update(nestJobId, { progress });
    }
    throw new Error(`Document indexing timed out after ${5 * 60}s`);
  }

  // ─── BullMQ failure hook ───────────────────────────────────────────────────

  @OnQueueFailed()
  async onFailed(job: Job<JobPayload>, error: Error) {
    this.logger.error(`BullMQ marked job ${job.data?.jobId} as failed: ${error.message}`);
    if (job.data?.jobId) {
      await this.jobRepo.update(job.data.jobId, { status: 'failed', error: error.message });
    }
  }
}
