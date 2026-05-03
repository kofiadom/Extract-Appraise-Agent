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

@ApiTags('pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('run')
  @ApiOperation({ summary: 'Start extraction + appraisal pipeline for uploaded papers' })
  @ApiResponse({ status: 201, description: 'Pipeline jobs queued — poll each jobId for status' })
  async run(@Body() body: RunPipelineDto, @CurrentUser() user: AuthUser) {
    const result = await this.pipelineService.runPipeline(user.userId, body.markdownFiles);
    return { success: true, message: 'Pipeline jobs queued', data: result };
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
