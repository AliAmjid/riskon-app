import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgentRun } from './agent-run.entity.js';

@Entity('artifacts')
export class Artifact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  runId!: string;

  @ManyToOne(() => AgentRun, (run) => run.artifacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run!: AgentRun;

  @Column({ type: 'varchar', length: 1024 })
  path!: string;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  storageKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
