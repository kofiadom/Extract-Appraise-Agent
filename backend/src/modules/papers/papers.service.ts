import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastApiService } from '../fastapi/fastapi.service';

@Injectable()
export class PapersService {
  constructor(
    private readonly config: ConfigService,
    private readonly fastApi: FastApiService,
  ) {}

  async uploadPapers(
    files: Express.Multer.File[],
    userId: string,
  ): Promise<{ markdownFiles: string[]; fileMapping: Record<string, string> }> {
    const maxDocs = parseInt(this.config.get<string>('MAX_DOCS_PER_RUN', '5'), 10);
    if (files.length > maxDocs) {
      throw new BadRequestException(`Maximum ${maxDocs} documents allowed per run`);
    }

    const { markdownFiles } = await this.fastApi.uploadFiles(files, userId);

    // Map each markdownFile back to the original uploaded filename (same order)
    const fileMapping: Record<string, string> = {};
    markdownFiles.forEach((md, i) => {
      fileMapping[md] = files[i]?.originalname ?? md;
    });

    return { markdownFiles, fileMapping };
  }
}
