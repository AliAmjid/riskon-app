import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RunStatus, AgentRuntime } from '@riskon/shared';
import { RunEvent } from './run-event.entity.js';
import { RunArtifact } from './run-artifact.entity.js';
import { RunQuestionRound } from './run-question.entity.js';

@Entity('agent_runs')
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  businessQuestion!: string;

  /** A URL the agent loads directly. Derived from `datasetId` when uploaded. */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  dataSource!: string | null;

  @Column({ type: 'uuid', nullable: true })
  datasetId!: string | null;

  /** All uploaded files for this run, in the order the stakeholder attached them. */
  @Column({ type: 'simple-json', nullable: true })
  datasetIds!: string[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  template!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'cloud' })
  runtime!: AgentRuntime;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  repositoryUrl!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: RunStatus;

  /**
   * Bearer of the MCP endpoint for this run. The agent's inline MCP server URL
   * ends with this token; it is how a tool call from inside the cloud VM is
   * attributed back to a run without trusting anything the agent says.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  mcpToken!: string | null;

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

  @OneToMany(() => RunArtifact, (artifact) => artifact.run)
  artifacts!: RunArtifact[];

  @OneToMany(() => RunQuestionRound, (question) => question.run)
  questions!: RunQuestionRound[];
}
