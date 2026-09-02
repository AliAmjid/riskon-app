import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ReadStream } from 'node:fs';
import type { DatasetSummary } from '@riskon/shared';
import { Dataset } from '../database/entities/dataset.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { AppConfig } from '../config/app-config.js';

/** Extensions `riskon load` understands. Anything else is rejected early. */
const ACCEPTED = new Set([
  'csv',
  'tsv',
  'txt',
  'json',
  'jsonl',
  'ndjson',
  'parquet',
  'xlsx',
  'xls',
]);

const TEXTUAL = new Set(['csv', 'tsv', 'txt', 'json', 'jsonl', 'ndjson']);

@Injectable()
export class DatasetsService {
  constructor(
    @InjectRepository(Dataset)
    private readonly datasets: Repository<Dataset>,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  async create(file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<DatasetSummary> {
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED.has(extension)) {
      throw new BadRequestException(
        `Cannot read a .${extension || 'unknown'} file. Upload one of: ${[...ACCEPTED].join(', ')}.`,
      );
    }
    if (file.buffer.byteLength === 0) {
      throw new BadRequestException('That file is empty.');
    }

    const id = this.storage.newId();
    const key = this.storage.buildKey('datasets', id, file.originalname);
    const stored = await this.storage.put(key, file.buffer);

    const dataset = await this.datasets.save(
      this.datasets.create({
        id,
        filename: file.originalname,
        contentType: file.mimetype || 'application/octet-stream',
        sizeBytes: String(stored.sizeBytes),
        rowCountEstimate: TEXTUAL.has(extension)
          ? this.estimateRows(file.buffer)
          : null,
        storageKey: key,
      }),
    );

    return this.toSummary(dataset);
  }

  async findOne(id: string): Promise<Dataset> {
    const dataset = await this.datasets.findOne({ where: { id } });
    if (!dataset) {
      throw new NotFoundException(`Dataset ${id} not found`);
    }
    return dataset;
  }

  async findMany(ids: string[]): Promise<Dataset[]> {
    if (ids.length === 0) return [];
    const rows = await this.datasets.findBy({ id: In(ids) });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      if (!row) {
        throw new NotFoundException(`Dataset ${id} not found`);
      }
      return row;
    });
  }

  async findAll(): Promise<DatasetSummary[]> {
    const rows = await this.datasets.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toSummary(row));
  }

  async openStream(id: string): Promise<{ dataset: Dataset; stream: ReadStream }> {
    const dataset = await this.findOne(id);
    return { dataset, stream: await this.storage.open(dataset.storageKey) };
  }

  /**
   * The URL handed to the agent. Absolute and public, because the agent runs on
   * a Cursor VM with no route back to a private address.
   */
  downloadUrl(id: string): string {
    return `${this.config.publicBaseUrl}/datasets/${id}/raw`;
  }

  toSummary(dataset: Dataset): DatasetSummary {
    return {
      id: dataset.id,
      filename: dataset.filename,
      contentType: dataset.contentType,
      sizeBytes: Number(dataset.sizeBytes),
      rowCountEstimate: dataset.rowCountEstimate,
      downloadUrl: this.downloadUrl(dataset.id),
      createdAt: dataset.createdAt.toISOString(),
    };
  }

  /** Newlines minus a header row. Good enough to show "≈54,000 rows". */
  /**
   * Data rows, for showing the stakeholder how big their file is.
   *
   * Counting newlines is wrong for a quoted field that spans lines, so this is
   * an estimate and is labelled as one everywhere it surfaces. The agent gets
   * the exact count from `riskon load`.
   */
  private estimateRows(buffer: Buffer): number {
    if (buffer.length === 0) return 0;

    let newlines = 0;
    for (const byte of buffer) {
      if (byte === 0x0a) {
        newlines += 1;
      }
    }

    // A file that does not end in a newline still has a final line.
    const lines = buffer[buffer.length - 1] === 0x0a ? newlines : newlines + 1;
    return Math.max(lines - 1, 0);
  }
}
