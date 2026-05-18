import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexedDocument } from '../../entities/indexed-document.entity';
import { JobsService } from '../jobs/jobs.service';
import { FastApiService } from '../fastapi/fastapi.service';
import { JOB_TYPES } from '../../types';

export function getChatPdfsDir(): string {
  const isDocker = fs.existsSync('/.dockerenv');
  const defaultDir = isDocker ? '/app/tmp/chat_pdfs' : path.resolve(process.cwd(), '../tmp/chat_pdfs');
  return path.resolve(process.env.CHAT_PDFS_DIR ?? defaultDir);
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

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
    const result = await this.jobsService.submitJob({
      userId,
      jobType: JOB_TYPES.DOCUMENT_INDEXING,
      data: { fastapiJobId, fileName: file.originalname },
    });

    // Persist the original PDF so it can be served after the session ends.
    // Saved as {jobId}.pdf now; the processor renames it to {docId}.pdf on completion.
    try {
      const dir = getChatPdfsDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${result.jobId}.pdf`), file.buffer);
    } catch (err) {
      this.logger.warn(`Could not persist chat PDF for job ${result.jobId}: ${err}`);
    }

    return result;
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

  async getPdfPath(docId: string, userId: string): Promise<string> {
    const doc = await this.docRepo.findOne({ where: { docId, userId } });
    if (!doc) throw new NotFoundException('Document not found');
    const filePath = path.join(getChatPdfsDir(), `${docId}.pdf`);
    if (!fs.existsSync(filePath)) throw new NotFoundException('PDF not available for this document');
    return filePath;
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
