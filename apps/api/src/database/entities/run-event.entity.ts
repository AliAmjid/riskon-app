import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AgentRun } from './agent-run.entity.js';

@Entity('run_events')
export class RunEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  runId!: string;

  // Referenced by entity name, not by class: AgentRun imports this module to
  // declare its side of the relation, and a value import back would close an
  // ESM cycle that fails at load time. The `import type` above is erased.
  @ManyToOne('AgentRun', 'events', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run!: AgentRun;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
