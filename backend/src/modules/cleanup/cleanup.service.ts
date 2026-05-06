import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { PipelineJob } from '../../entities/pipeline-job.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly mdDir: string;
  private readonly ttlDays: number;

  constructor(
    @InjectRepository(PipelineJob) private readonly jobRepo: Repository<PipelineJob>,
    config: ConfigService,
  ) {
    // Docker default: /app/tmp/papers_fs_md  (volume ./tmp:/app/tmp)
    // Local dev:      set MARKDOWN_FS_DIR=../tmp/papers_fs_md in backend/.env
    const defaultDir = path.join(process.cwd(), 'tmp', 'papers_fs_md');
    this.mdDir = path.resolve(config.get<string>('MARKDOWN_FS_DIR', defaultDir));
    this.ttlDays = parseInt(config.get<string>('MARKDOWN_TTL_DAYS', '30'), 10);
  }

  /**
   * Runs once at midnight every day.
   * Deletes markdown files that are:
   *   1. Not referenced by any pipeline_job record, AND
   *   2. Older than MARKDOWN_TTL_DAYS (default 30 days)
   *
   * Files still referenced by any job (completed or otherwise) are kept,
   * so reruns always work without needing LlamaParse again.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanOrphanedMarkdowns(): Promise<{ deleted: number; kept: number; dir: string }> {
    if (!fs.existsSync(this.mdDir)) {
      this.logger.warn('Markdown directory not found, skipping cleanup: %s', this.mdDir);
      return { deleted: 0, kept: 0, dir: this.mdDir };
    }

    const diskFiles = fs.readdirSync(this.mdDir).filter((f) => f.endsWith('.md'));
    if (diskFiles.length === 0) {
      return { deleted: 0, kept: 0, dir: this.mdDir };
    }

    // Collect every markdown filename referenced by any job
    const rows = (await this.jobRepo
      .createQueryBuilder('job')
      .select(`job.inputData -> 'markdownFiles'`, 'files')
      .getRawMany()) as Array<{ files: unknown }>;

    const referencedFiles = new Set<string>();
    for (const row of rows) {
      if (Array.isArray(row.files)) {
        (row.files as string[]).forEach((f) => referencedFiles.add(f));
      }
    }

    const ttlMs = this.ttlDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;

    for (const filename of diskFiles) {
      if (referencedFiles.has(filename)) continue;

      const filePath = path.join(this.mdDir, filename);
      const ageDays = Math.round((now - fs.statSync(filePath).mtimeMs) / 86_400_000);

      if (now - fs.statSync(filePath).mtimeMs > ttlMs) {
        fs.unlinkSync(filePath);
        deleted++;
        this.logger.log(`Deleted orphaned markdown: ${filename} (${ageDays}d old)`);
      }
    }

    const kept = diskFiles.length - deleted;
    this.logger.log(`Cleanup complete: ${deleted} deleted, ${kept} kept (dir: ${this.mdDir})`);
    return { deleted, kept, dir: this.mdDir };
  }
}
