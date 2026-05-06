import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.interfaces';
import { JobsService } from './jobs.service';
import { SubmitJobDto, ApiSuccessResponseDto, ApiErrorResponseDto } from './dto';

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a background job' })
  @ApiResponse({ status: 201, description: 'Job submitted', type: ApiSuccessResponseDto })
  async submitJob(@Body() body: SubmitJobDto, @CurrentUser() user: AuthUser) {
    const result = await this.jobsService.submitJob({
      userId: user.userId,
      data: body.data,
    });
    return { success: true, message: 'Job submitted successfully', data: result };
  }

  @Get('_/metrics')
  @ApiOperation({ summary: 'Get job metrics for the current user' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved', type: ApiSuccessResponseDto })
  async getMetrics(@CurrentUser() user: AuthUser) {
    const metrics = await this.jobsService.getMetrics(user.userId);
    return { success: true, data: metrics };
  }

  @Get()
  @ApiOperation({ summary: 'List jobs for the current user' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 50)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Page offset (default 0)' })
  async listJobs(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.jobsService.listJobs({
      userId: user.userId,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return { success: true, data: result };
  }

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get job status' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Job status', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found', type: ApiErrorResponseDto })
  async getJobStatus(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    const status = await this.jobsService.getJobStatus(jobId, user.userId);
    return { success: true, data: status };
  }

  @Get(':jobId/result')
  @ApiOperation({ summary: 'Get completed job result' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Job result', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found or not completed', type: ApiErrorResponseDto })
  async getJobResult(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    const result = await this.jobsService.getJobResult(jobId, user.userId);
    return { success: true, data: result };
  }

  @Delete(':jobId')
  @ApiOperation({ summary: 'Delete a job from history (and cancel if active)' })
  @ApiParam({ name: 'jobId' })
  @ApiResponse({ status: 200, description: 'Job deleted', type: ApiSuccessResponseDto })
  async deleteJob(@Param('jobId') jobId: string, @CurrentUser() user: AuthUser) {
    await this.jobsService.deleteJob(jobId, user.userId);
    return { success: true, message: 'Job deleted successfully' };
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all run history for the current user' })
  @ApiResponse({ status: 200, description: 'History cleared', type: ApiSuccessResponseDto })
  async clearHistory(@CurrentUser() user: AuthUser) {
    const result = await this.jobsService.clearHistory(user.userId);
    return { success: true, message: `${result.deleted} record(s) deleted`, data: result };
  }
}
