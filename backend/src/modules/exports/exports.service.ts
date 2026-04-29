import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineJob } from '../../entities/pipeline-job.entity';
import { ExcelGenerator } from './generators/excel.generator';
import { DocxGenerator } from './generators/docx.generator';
import { PipelineResult } from './interfaces/result.interface';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(PipelineJob) private readonly jobRepo: Repository<PipelineJob>,
    private readonly excelGenerator: ExcelGenerator,
    private readonly docxGenerator: DocxGenerator,
  ) {}

  async generateExcel(jobId: string, userId: string): Promise<Buffer> {
    const result = await this.getCompletedResult(jobId, userId);
    const papers = result.papers ?? [];
    if (papers.length === 0) throw new BadRequestException('No extraction results found in this job');
    return this.excelGenerator.generate(papers);
  }

  async generateDocx(jobId: string, userId: string): Promise<Buffer> {
    const result = await this.getCompletedResult(jobId, userId);
    const appraisals = result.appraisals ?? [];
    if (appraisals.length === 0) throw new BadRequestException('No appraisal results found in this job');
    return this.docxGenerator.generate(appraisals);
  }

  async getRawJson(jobId: string, userId: string): Promise<PipelineResult> {
    return this.getCompletedResult(jobId, userId);
  }

  private async getCompletedResult(jobId: string, userId: string): Promise<PipelineResult> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== 'completed') {
      throw new BadRequestException(`Job is not completed (current status: ${job.status})`);
    }
    if (!job.result) throw new BadRequestException('Job has no stored result');
    return job.result as unknown as PipelineResult;
  }
}
