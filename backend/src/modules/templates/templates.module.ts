import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserTemplate } from '../../entities/user-template.entity';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { FastApiModule } from '../fastapi/fastapi.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserTemplate]), FastApiModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
