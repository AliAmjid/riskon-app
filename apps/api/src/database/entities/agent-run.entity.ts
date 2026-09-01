import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RunStatus, AgentRuntime } from '@riskon/shared';
import { RunEvent } from './run-event.entity.js';
import { Artifact } from './artifact.entity.js';

@Entity('agent_runs')
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  businessQuestion!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  dataSource!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  template!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'local' })
  runtime!: AgentRuntime;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: RunStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  cursorAgentId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  cursorRunId!: string | null;

  @Column({ type: 'text', nullable: true })
  result!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @OneToMany(() => RunEvent, (event) => event.run)
  events!: RunEvent[];

  @OneToMany(() => Artifact, (artifact) => artifact.run)
  artifacts!: Artifact[];
}
