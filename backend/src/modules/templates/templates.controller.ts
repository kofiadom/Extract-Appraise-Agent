import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.interfaces';
import { TemplatesService } from './templates.service';
import { FastApiService } from '../fastapi/fastapi.service';
import { SaveTemplateDto } from './dto/save-template.dto';

const ACCEPTED_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
]);

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly fastApiService: FastApiService,
  ) {}

  @Post('parse')
  @ApiOperation({ summary: 'Upload template files and start BYOT parsing job' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        extraction_template: { type: 'string', format: 'binary' },
        appraisal_template: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'BYOT parsing job started — poll /templates/parse-job/:jobId' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'extraction_template', maxCount: 1 },
        { name: 'appraisal_template', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        fileFilter: (_req, file, cb) => {
          if (!ACCEPTED_MIMETYPES.has(file.mimetype)) {
            return cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
          }
          cb(null, true);
        },
        limits: { fileSize: 20 * 1024 * 1024 },
      },
    ),
  )
  async parseTemplates(
    @UploadedFiles()
    files: {
      extraction_template?: Express.Multer.File[];
      appraisal_template?: Express.Multer.File[];
    },
    @CurrentUser() user: AuthUser,
  ) {
    const extractionFile = files?.extraction_template?.[0];
    const appraisalFile = files?.appraisal_template?.[0];

    if (!extractionFile && !appraisalFile) {
      throw new BadRequestException('At least one template file is required');
    }

    const fastapiJobId = await this.fastApiService.startByotParsing(
      extractionFile,
      appraisalFile,
      user.userId,
    );

    return { success: true, data: { fastapiJobId } };
  }

  @Get('parse-job/:jobId')
  @ApiOperation({ summary: 'Poll BYOT parsing job status' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Job status + parsed template when done' })
  async getParseJobStatus(@Param('jobId') jobId: string) {
    const result = await this.fastApiService.pollByotJob(jobId);
    return { success: true, data: result };
  }

  @Post()
  @ApiOperation({ summary: 'Save an approved BYOT template for reuse' })
  @ApiResponse({ status: 201, description: 'Template saved' })
  async save(@Body() dto: SaveTemplateDto, @CurrentUser() user: AuthUser) {
    const tpl = await this.templatesService.save(user.userId, dto);
    return { success: true, data: tpl };
  }

  @Get()
  @ApiOperation({ summary: "List the current user's saved templates" })
  @ApiResponse({ status: 200, description: 'Array of template summaries' })
  async list(@CurrentUser() user: AuthUser) {
    const templates = await this.templatesService.findAllForUser(user.userId);
    return { success: true, data: templates };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single template with full field/criteria data' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Full template object' })
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const tpl = await this.templatesService.findOne(id, user.userId);
    return { success: true, data: tpl };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a saved template' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Template updated' })
  async update(@Param('id') id: string, @Body() dto: SaveTemplateDto, @CurrentUser() user: AuthUser) {
    const updated = await this.templatesService.update(id, user.userId, dto);
    return { success: true, data: updated };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved template' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.templatesService.remove(id, user.userId);
    return { success: true, message: 'Template deleted' };
  }
}
