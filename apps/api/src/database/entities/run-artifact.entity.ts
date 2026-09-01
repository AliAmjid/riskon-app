import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { AgentRun } from './agent-run.entity.js';

/**
 * A file the agent published under `artifacts/`, copied into our storage.
 *
 * Cursor's artifact download URLs are presigned and expire after 15 minutes,
 * and artifacts are scoped to the agent rather than the run — so we pull the
 * bytes once when a run ends and serve our own copy from then on.
 */
@Entity('run_artifacts')
@Unique('uq_run_artifact_path', ['runId', 'path'])
export class RunArtifact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  runId!: string;

  // By entity name: a value import of AgentRun would close an ESM cycle, since
  // AgentRun imports this module to declare its side of the relation.
  @ManyToOne('AgentRun', 'artifacts', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run!: AgentRun;

  /** Relative path with the `artifacts/` prefix stripped, e.g. `report.md`. */
  @Column({ type: 'varchar', length: 1024 })
  path!: string;

  @Column({ type: 'varchar', length: 255, default: 'application/octet-stream' })
  contentType!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: string;

  @Column({ type: 'varchar', length: 1024 })
  storageKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
