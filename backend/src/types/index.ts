export interface JobPayload {
  jobId: string;
  jobType: string;
  data: Record<string, unknown>;
  userId?: string;
  submittedAt: Date;
}

export interface JobStatus {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
  processingTime?: number;
}

export const QUEUE_NAMES = {
  BACKGROUND_JOBS: 'background-jobs',
} as const;

export const JOB_TYPES = {
  BACKGROUND_JOB: 'background-job',
  PAPER_PIPELINE: 'paper-pipeline',
  DOCUMENT_INDEXING: 'document-indexing',
} as const;

export interface QueueMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  queueHealth: {
    [key: string]: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
}
