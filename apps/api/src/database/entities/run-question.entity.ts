import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { QuestionRequestStatus, RunQuestion } from '@riskon/shared';
import type { AgentRun } from './agent-run.entity.js';

/**
 * One round of questions from the agent to the stakeholder.
 *
 * The playbook asks the agent to send its whole round in a single call, so a
 * row here holds several questions and the answers to all of them. Persisting
 * it (rather than keeping it in memory) means a page reload, or an API restart
 * mid-run, does not lose the question the agent is still blocked on.
 */
@Entity('run_questions')
export class RunQuestionRound {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  runId!: string;

  // By entity name: a value import of AgentRun would close an ESM cycle, since
  // AgentRun imports this module to declare its side of the relation.
  @ManyToOne('AgentRun', 'questions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run!: AgentRun;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: QuestionRequestStatus;

  @Column({ type: 'text', nullable: true })
  intro!: string | null;

  @Column({ type: 'jsonb' })
  questions!: RunQuestion[];

  @Column({ type: 'jsonb', nullable: true })
  answers!: Record<string, string> | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
