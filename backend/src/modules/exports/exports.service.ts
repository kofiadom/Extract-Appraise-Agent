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
    const result = await this.getParsedResult(jobId, userId);
    const papers = result.papers ?? [];
    if (papers.length === 0) throw new BadRequestException('No extraction results found in this job');
    return this.excelGenerator.generate(papers);
  }

  async generateDocx(jobId: string, userId: string): Promise<Buffer> {
    const result = await this.getParsedResult(jobId, userId);
    const appraisals = result.appraisals ?? [];
    if (appraisals.length === 0) throw new BadRequestException('No appraisal results found in this job');
    return this.docxGenerator.generate(appraisals);
  }

  async getRawJson(jobId: string, userId: string): Promise<Record<string, unknown>> {
    const job = await this.findCompletedJob(jobId, userId);
    return job.result as Record<string, unknown>;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async getParsedResult(jobId: string, userId: string): Promise<PipelineResult> {
    const job = await this.findCompletedJob(jobId, userId);
    const raw = job.result as Record<string, unknown>;
    const parsed = this.extractFromRaw(raw);
    if (!parsed) throw new BadRequestException('Could not parse structured results from this job');
    return parsed;
  }

  private async findCompletedJob(jobId: string, userId: string): Promise<PipelineJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status !== 'completed') {
      throw new BadRequestException(`Job is not completed (current status: ${job.status})`);
    }
    if (!job.result) throw new BadRequestException('Job has no stored result');
    return job;
  }

  /**
   * Walk the full raw result tree (top-level content + all member_responses)
   * and return the first content string that parses to { papers, appraisals }.
   * Mirrors the findParsedResult logic on the frontend.
   */
  private extractFromRaw(raw: Record<string, unknown>): PipelineResult | null {
    const candidates: string[] = [];

    const collect = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (typeof n['content'] === 'string' && n['content']) {
        candidates.push(n['content'] as string);
      }
      const members = n['member_responses'];
      if (Array.isArray(members)) {
        for (const m of members) collect(m);
      }
    };

    collect(raw);

    for (const c of candidates) {
      const parsed = this.parseContent(c);
      if (parsed) return parsed;
    }
    return null;
  }

  /**
   * Extract { papers, appraisals } from a content string that may contain prose,
   * markdown fences, or multiple JSON blocks. Uses a string-aware brace scanner
   * so braces inside quoted values don't confuse the depth counter.
   */
  private parseContent(content: string): PipelineResult | null {
    if (!content) return null;

    const toResult = (d: Record<string, unknown>): PipelineResult | null => {
      if (!d?.['papers']) return null;
      return {
        papers: d['papers'] as PipelineResult['papers'],
        // Agent outputs { appraisal: { appraisals: [...] } } — flatten to top-level
        appraisals: ((d['appraisal'] as Record<string, unknown>)?.['appraisals'] ??
          d['appraisals']) as PipelineResult['appraisals'],
      };
    };

    // 1. Direct parse
    try {
      const d = JSON.parse(content.trim()) as Record<string, unknown>;
      const r = toResult(d);
      if (r) return r;
    } catch {}

    // 2. Strip markdown fences
    const stripped = content
      .replace(/^```(?:json)?\s*$/gm, '')
      .replace(/^```\s*$/gm, '')
      .trim();
    if (stripped !== content.trim()) {
      try {
        const d = JSON.parse(stripped) as Record<string, unknown>;
        const r = toResult(d);
        if (r) return r;
      } catch {}
    }

    // 3. String-aware brace scanner — finds every complete {...} block,
    //    skipping braces inside quoted strings, continues past non-matching blocks.
    let searchFrom = 0;
    while (searchFrom < content.length) {
      const blockStart = content.indexOf('{', searchFrom);
      if (blockStart === -1) break;

      let depth = 0;
      let inString = false;
      let escaped = false;
      let blockEnd = -1;

      for (let j = blockStart; j < content.length; j++) {
        const ch = content[j];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\' && inString) { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { blockEnd = j; break; }
        }
      }

      if (blockEnd === -1) break;

      try {
        const d = JSON.parse(content.slice(blockStart, blockEnd + 1)) as Record<string, unknown>;
        const r = toResult(d);
        if (r) return r;
      } catch {}

      searchFrom = blockStart + 1;
    }

    return null;
  }
}
