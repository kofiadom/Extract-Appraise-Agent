import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexedDocument } from '../../entities/indexed-document.entity';
import { JobsModule } from '../jobs/jobs.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [TypeOrmModule.forFeature([IndexedDocument]), JobsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
