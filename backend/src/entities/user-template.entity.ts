import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_templates')
export class UserTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: 'My Template' })
  name: string;

  @Column({ type: 'jsonb' })
  extractionTemplate: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  appraisalTemplate: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  sourceFiles: Record<string, string> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
