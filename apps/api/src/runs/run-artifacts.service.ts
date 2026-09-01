import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReadStream } from 'node:fs';
import type { RunArtifactSummary } from '@riskon/shared';
import { RunArtifact } from '../database/entities/run-artifact.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { AppConfig } from '../config/app-config.js';

/** Extension -> content type, for the handful of things the agent publishes. */
const CONTENT_TYPES: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  py: 'text/x-python; charset=utf-8',
  duckdb: 'application/vnd.duckdb',
  parquet: 'application/vnd.apache.parquet',
  png: 'image/png',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
};

/** What we are willing to render in the browser rather than only download. */
const PREVIEWABLE = new Set(['md', 'csv', 'json', 'txt', 'py']);

/** Text we preview inline is capped so a huge CSV cannot wedge a tab. */
const PREVIEW_LIMIT_BYTES = 512 * 1024;

@Injectable()
export class RunArtifactsService {
  constructor(
    @InjectRepository(RunArtifact)
    private readonly artifacts: Repository<RunArtifact>,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Store one published file. Upserts on (runId, path): an agent that publishes
   * twice in one run should leave one row holding the newer bytes.
   */
  async store(
    runId: string,
    path: string,
    body: Buffer,
  ): Promise<RunArtifactSummary> {
    const existing = await this.artifacts.findOne({ where: { runId, path } });
    const id = existing?.id ?? this.storage.newId();
    const key = this.storage.buildKey(`artifacts/${runId}`, id, path);
    await this.storage.put(key, body);

    const saved = await this.artifacts.save(
      this.artifacts.create({
        ...(existing ?? {}),
        id,
        runId,
        path,
        contentType: contentTypeFor(path),
        sizeBytes: String(body.byteLength),
        storageKey: key,
      }),
    );
    return this.toSummary(saved);
  }

  async listForRun(runId: string): Promise<RunArtifactSummary[]> {
    const rows = await this.artifacts.find({
      where: { runId },
      order: { path: 'ASC' },
    });
    // report.md is the file to read first, so it leads regardless of alphabet.
    return rows
      .map((row) => this.toSummary(row))
      .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  }

  async countForRun(runId: string): Promise<number> {
    return this.artifacts.count({ where: { runId } });
  }

  async open(
    runId: string,
    artifactId: string,
  ): Promise<{ artifact: RunArtifact; stream: ReadStream }> {
    const artifact = await this.find(runId, artifactId);
    return { artifact, stream: await this.storage.open(artifact.storageKey) };
  }

  /** Inline text for the report viewer, or null when it is not text. */
  async preview(
    runId: string,
    artifactId: string,
  ): Promise<{ path: string; contentType: string; text: string | null }> {
    const artifact = await this.find(runId, artifactId);
    if (!isPreviewable(artifact.path)) {
      return {
        path: artifact.path,
        contentType: artifact.contentType,
        text: null,
      };
    }

    const stream = await this.storage.open(artifact.storageKey);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = chunk as Buffer;
      chunks.push(buffer);
      total += buffer.byteLength;
      if (total >= PREVIEW_LIMIT_BYTES) {
        stream.destroy();
        break;
      }
    }

    const text = Buffer.concat(chunks)
      .subarray(0, PREVIEW_LIMIT_BYTES)
      .toString('utf8');
    const truncated = Number(artifact.sizeBytes) > PREVIEW_LIMIT_BYTES;

    return {
      path: artifact.path,
      contentType: artifact.contentType,
      text: truncated
        ? `${text}\n\n… truncated. Download the file for the rest.`
        : text,
    };
  }

  private async find(runId: string, artifactId: string): Promise<RunArtifact> {
    const artifact = await this.artifacts.findOne({
      where: { id: artifactId, runId },
    });
    if (!artifact) {
      throw new NotFoundException(`Artifact ${artifactId} not found on this run`);
    }
    return artifact;
  }

  private toSummary(artifact: RunArtifact): RunArtifactSummary {
    return {
      id: artifact.id,
      runId: artifact.runId,
      path: artifact.path,
      contentType: artifact.contentType,
      sizeBytes: Number(artifact.sizeBytes),
      downloadUrl: `${this.config.publicBaseUrl}/runs/${artifact.runId}/artifacts/${artifact.id}/raw`,
      isPreviewable: isPreviewable(artifact.path),
      createdAt: artifact.createdAt.toISOString(),
    };
  }
}

function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extensionOf(path)] ?? 'application/octet-stream';
}

function isPreviewable(path: string): boolean {
  return PREVIEWABLE.has(extensionOf(path));
}

function rank(path: string): number {
  if (path === 'report.md') return 0;
  if (path === 'decision.csv') return 1;
  if (path === 'constraints.csv') return 2;
  return 3;
}
