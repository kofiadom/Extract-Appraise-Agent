import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { PipelineJob } from '../entities/pipeline-job.entity';
import { IndexedDocument } from '../entities/indexed-document.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME', 'agno_rag'),
        entities: [User, PipelineJob, IndexedDocument],
        synchronize: true,
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
