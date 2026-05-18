import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTemplate } from '../../entities/user-template.entity';
import { SaveTemplateDto } from './dto/save-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(UserTemplate)
    private readonly repo: Repository<UserTemplate>,
  ) {}

  async save(userId: string, dto: SaveTemplateDto): Promise<UserTemplate> {
    const tpl = this.repo.create({
      userId,
      name: dto.name,
      extractionTemplate: dto.extractionTemplate,
      appraisalTemplate: dto.appraisalTemplate,
      sourceFiles: dto.sourceFiles ?? null,
    });
    return this.repo.save(tpl);
  }

  async findAllForUser(userId: string): Promise<UserTemplate[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'sourceFiles', 'createdAt', 'updatedAt'],
    });
  }

  async findOne(id: string, userId: string): Promise<UserTemplate> {
    const tpl = await this.repo.findOne({ where: { id, userId } });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  async update(id: string, userId: string, dto: Partial<SaveTemplateDto>): Promise<UserTemplate> {
    const tpl = await this.findOne(id, userId);
    if (dto.name !== undefined) tpl.name = dto.name;
    if (dto.extractionTemplate !== undefined) tpl.extractionTemplate = dto.extractionTemplate;
    if (dto.appraisalTemplate !== undefined) tpl.appraisalTemplate = dto.appraisalTemplate;
    if (dto.sourceFiles !== undefined) tpl.sourceFiles = dto.sourceFiles;
    return this.repo.save(tpl);
  }

  async remove(id: string, userId: string): Promise<void> {
    const tpl = await this.findOne(id, userId);
    await this.repo.remove(tpl);
  }
}
