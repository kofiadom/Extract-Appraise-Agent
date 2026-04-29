import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../entities/user.entity';
import { PipelineJob } from '../entities/pipeline-job.entity';
import { IndexedDocument } from '../entities/indexed-document.entity';

dotenv.config();

// Used by TypeORM CLI for generating and running migrations.
// Run from the project root:
//   npm run migration:generate -- src/migrations/InitialSchema
//   npm run migration:run
//   npm run migration:revert
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'agno_rag',
  entities: [User, PipelineJob, IndexedDocument],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
});
