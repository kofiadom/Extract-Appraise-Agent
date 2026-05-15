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

    const { files: storedPaths, markdownFiles } = await this.fastApi.uploadFiles(files, userId);

    // Map each markdownFile → absolute path returned by FastAPI for reliable PDF serving
    const fileMapping: Record<string, string> = {};
    markdownFiles.forEach((md, i) => {
      fileMapping[md] = storedPaths[i] ?? files[i]?.originalname ?? md;
    });

    return { markdownFiles, fileMapping };
  }
}
