import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import FormData = require('form-data');

export interface IndexJobResult {
  doc_id: string;
  doc_name: string;
  page_count: number;
}

@Injectable()
export class FastApiService {
  private readonly logger = new Logger(FastApiService.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.http = axios.create({
      baseURL: config.get<string>('FASTAPI_URL', 'http://localhost:8000'),
      timeout: 30_000,
    });
  }

  // ─── Pipeline ────────────────────────────────────────────────────────────────

  async uploadFiles(
    files: Express.Multer.File[],
    userId: string,
  ): Promise<{ files: string[]; markdownFiles: string[] }> {
    const form = new FormData();
    form.append('user_id', userId);
    for (const f of files) {
      form.append('files', f.buffer, { filename: f.originalname, contentType: f.mimetype });
    }
    try {
      const { data } = await this.http.post('/upload-fs', form, {
        headers: form.getHeaders(),
        timeout: 120_000,
      });
      return {
        files: (data.files as string[]) ?? [],
        markdownFiles: (data.markdown_files as string[]) ?? [],
      };
    } catch (error) {
      this.logger.error('FastAPI upload failed:', error);
      throw new InternalServerErrorException('File upload to AI service failed');
    }
  }

  async startPipeline(markdownFiles: string[], userId: string, sessionId: string): Promise<string> {
    try {
      const { data } = await this.http.post('/pipeline/run-async', {
        markdown_files: markdownFiles,
        user_id: userId,
        session_id: sessionId,
      });
      return data.job_id as string;
    } catch (error) {
      this.logger.error('FastAPI pipeline start failed:', error);
      throw new InternalServerErrorException('AI pipeline start failed');
    }
  }

  async pollPipeline(
    fastapiJobId: string,
  ): Promise<{ status: string; result?: Record<string, unknown> }> {
    try {
      const { data } = await this.http.get(`/pipeline/job/${fastapiJobId}`);
      return {
        status: data.status as string,
        result: data.result as Record<string, unknown> | undefined,
      };
    } catch (error) {
      this.logger.error(`FastAPI poll failed for job ${fastapiJobId}:`, error);
      throw new InternalServerErrorException('AI pipeline status check failed');
    }
  }

  // ─── Chat / Document Indexing ────────────────────────────────────────────────

  async indexDocumentAsync(file: Express.Multer.File): Promise<string> {
    const form = new FormData();
    form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    try {
      const { data } = await this.http.post('/chat/index-async', form, {
        headers: form.getHeaders(),
        timeout: 60_000,
      });
      return data.job_id as string;
    } catch (error) {
      this.logger.error('FastAPI document index start failed:', error);
      throw new InternalServerErrorException('Document indexing start failed');
    }
  }

  async pollIndexJob(
    fastapiJobId: string,
  ): Promise<{ status: string; result?: IndexJobResult }> {
    try {
      const { data } = await this.http.get(`/chat/index-job/${fastapiJobId}`);
      return {
        status: data.status as string,
        result: data.result as IndexJobResult | undefined,
      };
    } catch (error) {
      this.logger.error(`FastAPI index poll failed for job ${fastapiJobId}:`, error);
      throw new InternalServerErrorException('Document indexing status check failed');
    }
  }

  async deleteDocument(docId: string): Promise<void> {
    try {
      await this.http.delete(`/chat/document/${docId}`);
    } catch (error) {
      this.logger.error(`FastAPI delete document failed for ${docId}:`, error);
      throw new InternalServerErrorException('Document deletion from AI service failed');
    }
  }

  // Chat is synchronous — returns agent response directly (no background job needed)
  async chatQuery(
    message: string,
    userId: string,
    sessionId: string,
  ): Promise<Record<string, unknown>> {
    const form = new URLSearchParams();
    form.append('message', message);
    form.append('user_id', userId);
    form.append('session_id', sessionId);
    form.append('stream', 'false');
    try {
      const { data } = await this.http.post(
        '/agents/pageindex-chat-agent/runs',
        form,
        { timeout: 120_000 },
      );
      return data as Record<string, unknown>;
    } catch (error) {
      this.logger.error('FastAPI chat query failed:', error);
      throw new InternalServerErrorException('Chat query to AI service failed');
    }
  }

  // SSE streaming — returns the raw Node.js Readable so the controller can pipe it
  async chatQueryStream(message: string, userId: string, sessionId: string) {
    const form = new URLSearchParams();
    form.append('message', message);
    form.append('user_id', userId);
    form.append('session_id', sessionId);
    form.append('stream', 'true');
    form.append('stream_events', 'true');
    try {
      const { data } = await this.http.post(
        '/agents/pageindex-chat-agent/runs',
        form,
        { responseType: 'stream', timeout: 120_000 },
      );
      return data;
    } catch (error) {
      this.logger.error('FastAPI chat stream failed:', error);
      throw new InternalServerErrorException('Chat stream from AI service failed');
    }
  }
}
