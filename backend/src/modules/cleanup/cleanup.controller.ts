import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CleanupService } from './cleanup.service';

@ApiTags('cleanup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleanup')
export class CleanupController {
  constructor(private readonly cleanupService: CleanupService) {}

  @Post('markdowns')
  @ApiOperation({
    summary: 'Manually trigger orphaned markdown cleanup',
    description:
      'Deletes markdown files in tmp/papers_fs_md/ that are not referenced by any ' +
      'pipeline job and are older than MARKDOWN_TTL_DAYS (default 30). ' +
      'Safe to run at any time — referenced files are never deleted.',
  })
  @ApiResponse({ status: 201, description: '{ deleted, kept, dir }' })
  async cleanMarkdowns() {
    const result = await this.cleanupService.cleanOrphanedMarkdowns();
    return { success: true, data: result };
  }
}
