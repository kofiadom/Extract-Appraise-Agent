import { Controller, Get, Query, UseGuards, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.interfaces';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('excel')
  @ApiOperation({ summary: 'Download evidence table as Excel (.xlsx)' })
  @ApiQuery({ name: 'jobId', required: true, description: 'Completed pipeline job ID' })
  @ApiResponse({ status: 200, description: 'Returns .xlsx file' })
  @ApiResponse({ status: 400, description: 'Job not completed or no extraction results' })
  async downloadExcel(
    @Query('jobId') jobId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    if (!jobId) throw new BadRequestException('jobId query parameter is required');
    const buffer = await this.exportsService.generateExcel(jobId, user.userId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="evidence-table-${jobId}.xlsx"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('docx')
  @ApiOperation({ summary: 'Download quality appraisal report as Word (.docx)' })
  @ApiQuery({ name: 'jobId', required: true, description: 'Completed pipeline job ID' })
  @ApiResponse({ status: 200, description: 'Returns .docx file' })
  @ApiResponse({ status: 400, description: 'Job not completed or no appraisal results' })
  async downloadDocx(
    @Query('jobId') jobId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    if (!jobId) throw new BadRequestException('jobId query parameter is required');
    const buffer = await this.exportsService.generateDocx(jobId, user.userId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="appraisal-report-${jobId}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('json')
  @ApiOperation({ summary: 'Download full pipeline result as JSON' })
  @ApiQuery({ name: 'jobId', required: true, description: 'Completed pipeline job ID' })
  @ApiResponse({ status: 200, description: 'Returns full extraction + appraisal JSON' })
  async downloadJson(
    @Query('jobId') jobId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    if (!jobId) throw new BadRequestException('jobId query parameter is required');
    const result = await this.exportsService.getRawJson(jobId, user.userId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pipeline-result-${jobId}.json"`,
    );
    res.end(JSON.stringify(result, null, 2));
  }
}
