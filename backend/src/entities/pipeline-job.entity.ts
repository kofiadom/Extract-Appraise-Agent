import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export type JobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';

@Entity('pipeline_jobs')
export class PipelineJob {
  // id = BullMQ jobId = Agno session_id — one UUID ties all three together
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: 'queued' })
  status: JobStatus;

  @Column({ default: 0 })
  progress: number;

  @Column({ default: 'background-job' })
  jobType: string;

  @Column({ type: 'jsonb', nullable: true })
  inputData: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown>;

  @Column({ nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
