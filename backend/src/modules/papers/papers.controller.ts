import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.interfaces';
import { PapersService } from './papers.service';

@ApiTags('papers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('papers')
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload PDF papers (max 5). Returns markdown filenames for /pipeline/run.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Papers uploaded and converted to markdown' })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
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
  async uploadPapers(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    const result = await this.papersService.uploadPapers(files, user.userId);
    return {
      success: true,
      message: `${files.length} paper(s) uploaded and converted`,
      data: result,
    };
  }
}
