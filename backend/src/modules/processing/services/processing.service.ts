import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../../../types';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BACKGROUND_JOBS) private readonly jobQueue: Queue,
  ) {}

  async getQueueStats() {
    try {
      const counts = await this.jobQueue.getJobCounts();
      const allJobs = await this.jobQueue.getJobs(['waiting', 'active', 'completed', 'failed']);

      const jobsByType = {
        [JOB_TYPES.BACKGROUND_JOB]: { waiting: 0, active: 0, completed: 0, failed: 0 },
      };

      allJobs.forEach((job) => {
        const type = job.name;
        if (jobsByType[type]) {
          if (job.finishedOn && !job.failedReason) jobsByType[type].completed++;
          else if (job.failedReason) jobsByType[type].failed++;
          else if (job.processedOn) jobsByType[type].active++;
          else jobsByType[type].waiting++;
        }
      });

      return {
        [QUEUE_NAMES.BACKGROUND_JOBS]: {
          total: counts,
          byJobType: jobsByType,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  async pauseQueue() {
    await this.jobQueue.pause();
    this.logger.log('Background jobs queue paused');
    return { success: true, message: 'Background jobs queue paused' };
  }

  async resumeQueue() {
    await this.jobQueue.resume();
    this.logger.log('Background jobs queue resumed');
    return { success: true, message: 'Background jobs queue resumed' };
  }

  async cleanQueue(grace = 5000) {
    await this.jobQueue.clean(grace, 'completed');
    await this.jobQueue.clean(grace, 'failed');
    this.logger.log('Background jobs queue cleaned');
    return { success: true, message: 'Background jobs queue cleaned' };
  }

  async retryFailedJobs(jobType?: string) {
    const failedJobs = await this.jobQueue.getJobs(['failed']);
    const toRetry = jobType ? failedJobs.filter((j) => j.name === jobType) : failedJobs;

    for (const job of toRetry) {
      await job.retry();
    }

    this.logger.log(`Retried ${toRetry.length} failed jobs`);
    return {
      success: true,
      message: `Retried ${toRetry.length} failed jobs`,
      retriedCount: toRetry.length,
    };
  }

  async getQueueMetrics() {
    const stats = await this.getQueueStats();
    const queueStats = stats[QUEUE_NAMES.BACKGROUND_JOBS];

    const recentJobs = await this.jobQueue.getJobs(['completed'], 0, 99);
    const processingTimes = recentJobs
      .filter((j) => j.finishedOn && j.processedOn)
      .map((j) => j.finishedOn! - j.processedOn!);

    const averageProcessingTime =
      processingTimes.length > 0
        ? processingTimes.reduce((s, t) => s + t, 0) / processingTimes.length
        : 0;

    return {
      queueName: QUEUE_NAMES.BACKGROUND_JOBS,
      totalJobs: Object.values(queueStats.total as unknown as Record<string, number>).reduce((s, c) => s + c, 0),
      averageProcessingTime,
      jobTypeBreakdown: queueStats.byJobType,
      currentCounts: queueStats.total,
      timestamp: new Date().toISOString(),
    };
  }

  async getHealthStatus() {
    try {
      const stats = await this.getQueueStats();
      const queueStats = stats[QUEUE_NAMES.BACKGROUND_JOBS];

      const totalJobs = queueStats.completed + queueStats.failed;
      const failureRate = totalJobs > 0 ? queueStats.failed / totalJobs : 0;
      const isHealthy = failureRate < 0.1;

      const jobTypeHealth = Object.entries(queueStats.byJobType).map(([jobType, counts]: [string, any]) => {
        const typeTotal = counts.completed + counts.failed;
        const typeFailureRate = typeTotal > 0 ? counts.failed / typeTotal : 0;
        return {
          jobType,
          healthy: typeFailureRate < 0.1,
          failureRate: Math.round(typeFailureRate * 100),
          counts,
        };
      });

      return {
        service: 'Processing Service',
        status: isHealthy && jobTypeHealth.every((c) => c.healthy) ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        queue: {
          name: QUEUE_NAMES.BACKGROUND_JOBS,
          healthy: isHealthy,
          failureRate: Math.round(failureRate * 100),
          counts: queueStats.total,
        },
        jobTypes: jobTypeHealth,
        stats,
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        service: 'Processing Service',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }
}
