import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('indexed_documents')
export class IndexedDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Document ID assigned by FastAPI / PageIndex
  @Column()
  docId: string;

  @Column()
  fileName: string;

  @Column({ nullable: true })
  pageCount: number;

  @CreateDateColumn()
  indexedAt: Date;
}
