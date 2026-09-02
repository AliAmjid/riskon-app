import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

export interface PreviewPage {
  columns: string[];
  rows: string[][];
  rowCount: number;
  tableName: string;
}

export interface PreviewSource {
  filename: string;
  file?: File;
  url?: string;
  fromWorkbench?: boolean;
}

export interface PreviewQuery {
  offset: number;
  limit: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdbMvp, mainWorker: mvpWorker },
  eh: { mainModule: duckdbEh, mainWorker: ehWorker },
};

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let loadedKey: string | null = null;
let loadedTable: string | null = null;
let loadLock: Promise<void> = Promise.resolve();

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const bundle = await duckdb.selectBundle(BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
  })();
  return dbPromise;
}

async function bytesFor(source: PreviewSource): Promise<Uint8Array> {
  if (source.file) return new Uint8Array(await source.file.arrayBuffer());
  if (source.url) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Could not load ${source.filename} (${response.status}).`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error('Nothing to preview.');
}

function sourceKey(source: PreviewSource): string {
  if (source.file) {
    return `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`;
  }
  return `url:${source.url ?? ''}:${source.fromWorkbench ? 'wb' : 'raw'}`;
}

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

async function pickWorkbenchTable(
  conn: duckdb.AsyncDuckDBConnection,
): Promise<string> {
  const result = await conn.query(`
    SELECT database_name, schema_name, table_name
    FROM duckdb_tables()
    WHERE database_name = 'wb'
    ORDER BY table_name
  `);
  const tables = result.toArray() as {
    database_name: string;
    schema_name: string;
    table_name: string;
  }[];
  if (!tables.length) {
    throw new Error('That workbench has no tables to show.');
  }
  const preferred =
    tables.find((row) => row.table_name === 'source') ??
    tables.find((row) => row.table_name === 'candidates') ??
    tables[0];
  return `${quoteIdent(preferred.database_name)}.${quoteIdent(preferred.schema_name)}.${quoteIdent(preferred.table_name)}`;
}

/**
 * Load a CSV, Parquet, JSON or .duckdb file in the browser and page through it.
 * The agent's workbench is attached read-only; uploads become a local table.
 */
async function clearLoaded(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  await conn.query('DROP TABLE IF EXISTS preview');
  await conn.query('DETACH DATABASE IF EXISTS wb');
  loadedKey = null;
  loadedTable = null;
}

export async function queryPreview(
  source: PreviewSource,
  query: PreviewQuery,
): Promise<PreviewPage> {
  const previous = loadLock;
  let release!: () => void;
  loadLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    return await queryPreviewLocked(source, query);
  } finally {
    release();
  }
}

async function queryPreviewLocked(
  source: PreviewSource,
  query: PreviewQuery,
): Promise<PreviewPage> {
  const db = await getDb();
  const key = sourceKey(source);

  if (loadedKey !== key || !loadedTable) {
    const bytes = await bytesFor(source);
    const conn = await db.connect();
    try {
      await clearLoaded(conn);

      const ext = extensionOf(source.filename);
      const vfsName = `upload.${ext || 'bin'}`;
      await db.registerFileBuffer(vfsName, bytes);

      if (ext === 'duckdb' || ext === 'db' || source.fromWorkbench) {
        await conn.query(`ATTACH '${vfsName}' AS wb (READ_ONLY)`);
        loadedTable = await pickWorkbenchTable(conn);
      } else if (ext === 'parquet') {
        await conn.query(
          `CREATE TABLE preview AS SELECT * FROM read_parquet('${vfsName}')`,
        );
        loadedTable = 'preview';
      } else if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') {
        await conn.query(
          `CREATE TABLE preview AS SELECT * FROM read_json_auto('${vfsName}')`,
        );
        loadedTable = 'preview';
      } else if (ext === 'tsv') {
        await conn.query(
          `CREATE TABLE preview AS SELECT * FROM read_csv_auto('${vfsName}', delim='\t')`,
        );
        loadedTable = 'preview';
      } else if (ext === 'csv' || ext === 'txt') {
        await conn.query(
          `CREATE TABLE preview AS SELECT * FROM read_csv_auto('${vfsName}')`,
        );
        loadedTable = 'preview';
      } else {
        throw new Error(
          `Cannot preview a .${ext || 'unknown'} file here. Open it from Results instead.`,
        );
      }
      loadedKey = key;
    } finally {
      await conn.close();
    }
  }

  const tableName = loadedTable;
  if (!tableName) {
    throw new Error('The file opened but had no table to show.');
  }
  const conn = await db.connect();
  try {
    const countResult = await conn.query(
      `SELECT count(*) AS n FROM ${tableName}`,
    );
    const rowCount = Number(
      (countResult.toArray()[0] as { n: number | bigint }).n,
    );

    const order =
      query.orderBy != null
        ? `ORDER BY ${quoteIdent(query.orderBy)} ${query.orderDir === 'desc' ? 'DESC' : 'ASC'}`
        : '';
    const page = await conn.query(
      `SELECT * FROM ${tableName} ${order} LIMIT ${query.limit} OFFSET ${query.offset}`,
    );
    const columns = page.schema.fields.map((field) => field.name);
    const rows = page
      .toArray()
      .map((row) =>
        columns.map((column) =>
          cellToString((row as Record<string, unknown>)[column]),
        ),
      );

    return { columns, rows, rowCount, tableName };
  } finally {
    await conn.close();
  }
}

export function resetPreviewCache(): void {
  loadedKey = null;
  loadedTable = null;
}
