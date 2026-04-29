import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexedDocument } from '../../entities/indexed-document.entity';
import { JobsService } from '../jobs/jobs.service';
import { FastApiService } from '../fastapi/fastapi.service';
import { JOB_TYPES } from '../../types';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(IndexedDocument)
    private readonly docRepo: Repository<IndexedDocument>,
    private readonly jobsService: JobsService,
    private readonly fastApi: FastApiService,
  ) {}

  async indexDocument(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{ jobId: string; status: string }> {
    const fastapiJobId = await this.fastApi.indexDocumentAsync(file);
    return this.jobsService.submitJob({
      userId,
      jobType: JOB_TYPES.DOCUMENT_INDEXING,
      data: { fastapiJobId, fileName: file.originalname },
    });
  }

  async getIndexJobStatus(jobId: string, userId: string) {
    return this.jobsService.getJobStatus(jobId, userId);
  }

  async listDocuments(userId: string): Promise<IndexedDocument[]> {
    return this.docRepo.find({
      where: { userId },
      order: { indexedAt: 'DESC' },
    });
  }

  async deleteDocument(docId: string, userId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { docId, userId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.userId !== userId) throw new ForbiddenException('Access denied');
    await this.fastApi.deleteDocument(docId);
    await this.docRepo.remove(doc);
  }

  async query(
    message: string,
    sessionId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    return this.fastApi.chatQuery(message, userId, sessionId);
  }

  async queryStream(message: string, sessionId: string, userId: string) {
    return this.fastApi.chatQueryStream(message, userId, sessionId);
  }
}
