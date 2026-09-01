import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgentRun } from './agent-run.entity.js';

@Entity('run_events')
export class RunEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  runId!: string;

  @ManyToOne(() => AgentRun, (run) => run.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run!: AgentRun;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
