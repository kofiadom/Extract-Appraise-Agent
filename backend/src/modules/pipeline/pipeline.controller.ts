import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
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
    const result = await this.pipelineService.runPipeline(user.userId, body.markdownFiles, body.steps);
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
    const jobs = await this.pipelineService.runPipelineForFiles(user.userId, body.markdownFiles, body.steps);
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
}
