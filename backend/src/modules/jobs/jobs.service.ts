import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { JobPayload, QueueMetrics, QUEUE_NAMES, JOB_TYPES } from '../../types';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BACKGROUND_JOBS) private readonly jobQueue: Queue,
    @InjectRepository(PipelineJob) private readonly jobRepo: Repository<PipelineJob>,
  ) {}

  async submitJob(request: {
    userId: string;
    jobType?: string;
    data?: Record<string, unknown>;
  }): Promise<{ jobId: string; status: string }> {
    const jobId = uuidv4();
    const jobType = request.jobType ?? JOB_TYPES.BACKGROUND_JOB;

    // Create durable record first — survives Redis flushes and server restarts
    await this.jobRepo.save({
      id: jobId,
      userId: request.userId,
      status: 'queued',
      progress: 0,
      jobType,
      inputData: request.data ?? {},
    });

    // Enqueue for worker — jobId is also the BullMQ job id and Agno session_id
    const payload: JobPayload = {
      jobId,
      jobType,
      data: request.data ?? {},
      userId: request.userId,
      submittedAt: new Date(),
    };

    await this.jobQueue.add(jobType, payload, { jobId });
    this.logger.log(`Job queued: ${jobId} (type: ${jobType}) for user: ${request.userId}`);

    return { jobId, status: 'queued' };
  }

  async getJobStatus(jobId: string, userId: string): Promise<PipelineJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    return job;
  }

  async getJobResult(jobId: string, userId: string): Promise<unknown> {
    const job = await this.getJobStatus(jobId, userId);
    if (job.status !== 'completed') {
      throw new NotFoundException('Job not completed yet');
    }
    return job.result;
  }

  async listJobs(filters: {
    userId: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ jobs: PipelineJob[]; total: number }> {
    const where: Record<string, unknown> = { userId: filters.userId };
    if (filters.status) where.status = filters.status;

    const [jobs, total] = await this.jobRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: filters.limit,
      skip: filters.offset,
    });

    return { jobs, total };
  }

  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const job = await this.getJobStatus(jobId, userId);
    if (!['queued', 'active'].includes(job.status)) return false;

    const bullJob = await this.jobQueue.getJob(jobId);
    if (bullJob) await bullJob.remove();

    await this.jobRepo.update(jobId, { status: 'cancelled' });
    this.logger.log(`Job cancelled: ${jobId}`);
    return true;
  }

  async deleteJob(jobId: string, userId: string): Promise<boolean> {
    const job = await this.getJobStatus(jobId, userId);

    // Remove from BullMQ if it exists there
    const bullJob = await this.jobQueue.getJob(jobId);
    if (bullJob) await bullJob.remove();

    await this.jobRepo.delete(jobId);
    this.logger.log(`Job deleted: ${jobId} by user: ${userId}`);
    return true;
  }

  /**
   * Delete all pipeline_job records for a user from the database.
   * Does NOT attempt to remove active Bull jobs from Redis — those will finish
   * naturally. Only the DB history is cleared.
   */
  async clearHistory(userId: string): Promise<{ deleted: number }> {
    const result = await this.jobRepo.delete({ userId });
    const deleted = result.affected ?? 0;
    this.logger.log(`History cleared for user ${userId}: ${deleted} record(s) deleted`);
    return { deleted };
  }

  async getMetrics(userId: string): Promise<QueueMetrics> {
    const rawRows = (await this.jobRepo
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('job.userId = :userId', { userId })
      .groupBy('job.status')
      .getRawMany()) as Array<{ status: string; count: string }>;

    const byStatus = rawRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const recent = (await this.jobRepo.find({
      where: { userId, status: 'completed' },
      select: ['createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
      take: 100,
    })) as PipelineJob[];

    const times: number[] = recent.map((j: PipelineJob) =>
      j.updatedAt.getTime() - j.createdAt.getTime(),
    );

    const totalJobs = (Object.values(byStatus) as number[]).reduce(
      (s: number, c: number) => s + c,
      0,
    );
    const avgTime =
      times.length > 0 ? times.reduce((s: number, t: number) => s + t, 0) / times.length : 0;

    return {
      totalJobs,
      completedJobs: byStatus['completed'] ?? 0,
      failedJobs: byStatus['failed'] ?? 0,
      averageProcessingTime: avgTime,
      queueHealth: {
        [QUEUE_NAMES.BACKGROUND_JOBS]: {
          waiting: byStatus['queued'] ?? 0,
          active: byStatus['active'] ?? 0,
          completed: byStatus['completed'] ?? 0,
          failed: byStatus['failed'] ?? 0,
        },
      },
    };
  }
}
