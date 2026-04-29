import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.interfaces';
import { ChatService } from './chat.service';
import { ChatQueryDto } from './dto/chat-query.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('index')
  @ApiOperation({ summary: 'Upload and index a PDF for document Q&A' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Indexing job queued — poll /index/jobs/:jobId' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Only PDF files are accepted'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async indexDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const result = await this.chatService.indexDocument(file, user.userId);
    return { success: true, message: 'Document indexing started', data: result };
  }

  @Get('index/jobs/:jobId')
  @ApiOperation({ summary: 'Poll document indexing job status' })
  @ApiParam({ name: 'jobId' })
  async getIndexJobStatus(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    const status = await this.chatService.getIndexJobStatus(jobId, user.userId);
    return { success: true, data: status };
  }

  @Get('documents')
  @ApiOperation({ summary: "List the caller's indexed documents" })
  async listDocuments(@CurrentUser() user: AuthUser) {
    const docs = await this.chatService.listDocuments(user.userId);
    return { success: true, data: docs };
  }

  @Delete('documents/:docId')
  @ApiOperation({ summary: 'Remove an indexed document' })
  @ApiParam({ name: 'docId', description: 'PageIndex document ID' })
  async deleteDocument(@Param('docId') docId: string, @CurrentUser() user: AuthUser) {
    await this.chatService.deleteDocument(docId, user.userId);
    return { success: true, message: 'Document removed' };
  }

  @Post('query')
  @ApiOperation({
    summary: 'Query indexed documents. Include a consistent sessionId to maintain multi-turn chat history.',
  })
  @ApiResponse({ status: 200, description: 'Agent response from FastAPI' })
  async query(@Body() body: ChatQueryDto, @CurrentUser() user: AuthUser) {
    const response = await this.chatService.query(body.message, body.sessionId, user.userId);
    return { success: true, data: response };
  }

  @Post('query/stream')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stream chat response as Server-Sent Events (SSE)' })
  async queryStream(
    @Body() body: ChatQueryDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/proxy buffering
    res.flushHeaders();

    try {
      const stream = await this.chatService.queryStream(body.message, body.sessionId, user.userId);
      stream.pipe(res);
      stream.on('end', () => res.end());
      stream.on('error', () => {
        res.write('data: {"event":"run_error"}\n\n');
        res.end();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stream failed';
      res.write(`data: ${JSON.stringify({ event: 'run_error', error: msg })}\n\n`);
      res.end();
    }
  }
}
