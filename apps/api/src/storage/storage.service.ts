import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app-config.js';

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

/**
 * Content-addressed-ish blob storage on local disk.
 *
 * The interface is deliberately the small subset that an object store also
 * offers — put, open, remove, size — so swapping the disk for S3 is a matter
 * of replacing this class rather than chasing `fs` calls through the app.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: AppConfig) {
    this.root = config.storageRoot;
  }

  /**
   * Build a key under a namespace. The filename is sanitised but preserved so
   * a human browsing the storage directory can tell what a blob is.
   */
  buildKey(namespace: string, id: string, filename: string): string {
    const safe = filename
      .replace(/[^\w.\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120);
    return `${namespace}/${id}/${safe || 'file'}`;
  }

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, sizeBytes: body.byteLength };
  }

  async open(key: string): Promise<ReadStream> {
    const target = this.resolveKey(key);
    try {
      await stat(target);
    } catch {
      throw new NotFoundException(
        'The stored file is missing. It may have been cleaned up.',
      );
    }
    return createReadStream(target);
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      this.logger.warn(`Could not remove ${key}: ${String(error)}`);
    }
  }

  newId(): string {
    return randomUUID();
  }

  /**
   * Keeps every key inside the storage root. Artifact paths originate from the
   * agent, so `../` in a path is a real possibility rather than a theoretical
   * one, and it must not be able to reach the rest of the filesystem.
   */
  private resolveKey(key: string): string {
    const target = resolve(join(this.root, normalize(key)));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new NotFoundException('Invalid storage key.');
    }
    return target;
  }
}
