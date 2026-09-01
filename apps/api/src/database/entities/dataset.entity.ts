import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A file the stakeholder uploaded. The bytes live in storage (see
 * StorageService); this row is the metadata plus the key to find them.
 */
@Entity('datasets')
export class Dataset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 512 })
  filename!: string;

  @Column({ type: 'varchar', length: 255, default: 'application/octet-stream' })
  contentType!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: string;

  /**
   * Newline count from the first read, so the UI can say "≈54,000 rows"
   * without parsing the file again. Null for non-text uploads.
   */
  @Column({ type: 'int', nullable: true })
  rowCountEstimate!: number | null;

  /** Path within the storage root. */
  @Column({ type: 'varchar', length: 1024 })
  storageKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
