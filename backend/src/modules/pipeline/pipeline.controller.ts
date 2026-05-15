import { Controller, Post, Get, Param, Query, Body, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.interfaces';
import { PipelineService } from './pipeline.service';
import { RunPipelineDto } from './dto/run-pipeline.dto';
import { CheckExistingDto } from './dto/check-existing.dto';

@ApiTags('pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('run')
  @ApiOperation({ summary: 'Start extraction + appraisal pipeline for uploaded papers (single job for all files)' })
  @ApiResponse({ status: 201, description: 'Pipeline job queued — poll /:jobId for status' })
  async run(@Body() body: RunPipelineDto, @CurrentUser() user: AuthUser) {
    const result = await this.pipelineService.runPipeline(user.userId, body.markdownFiles, body.steps, body.fileMapping);
    return { success: true, message: 'Pipeline job queued', data: result };
  }

  @Post('check-existing')
  @ApiOperation({ summary: 'Check if completed results already exist for these markdown files' })
  @ApiResponse({ status: 200, description: 'List of files that have prior completed results' })
  async checkExisting(@Body() body: CheckExistingDto, @CurrentUser() user: AuthUser) {
    const duplicates = await this.pipelineService.checkExisting(user.userId, body.markdownFiles);
    return { success: true, data: { duplicates } };
  }

  @Post('run-batch')
  @ApiOperation({ summary: 'Submit one independent pipeline job per file — returns array of {jobId, fileName}' })
  @ApiResponse({ status: 201, description: 'One job per file queued — poll each /:jobId independently' })
  async runBatch(@Body() body: RunPipelineDto, @CurrentUser() user: AuthUser) {
    const jobs = await this.pipelineService.runPipelineForFiles(user.userId, body.markdownFiles, body.steps, body.fileMapping);
    return { success: true, message: `${jobs.length} pipeline job(s) queued`, data: jobs };
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll pipeline job status' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Job status: queued | active | completed | failed' })
  async getStatus(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    const status = await this.pipelineService.getPipelineStatus(jobId, user.userId);
    return { success: true, data: status };
  }

  @Get(':jobId/result')
  @ApiOperation({ summary: 'Get completed pipeline result (papers + appraisals JSON)' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Full extraction and appraisal result' })
  @ApiResponse({ status: 404, description: 'Job not found or not yet completed' })
  async getResult(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    const result = await this.pipelineService.getPipelineResult(jobId, user.userId);
    return { success: true, data: result };
  }

  @Get(':jobId/pdf')
  @ApiOperation({ summary: 'Serve the original uploaded PDF for a pipeline job' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Returns the PDF file inline' })
  @ApiResponse({ status: 404, description: 'PDF not found or job predates PDF tracking' })
  async getPdf(
    @Param('jobId') jobId: string,
    @Query('file') file: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { filePath, originalName } = await this.pipelineService.getPipelinePdfPath(
      jobId,
      user.userId,
      file,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.sendFile(filePath);
  }
}
