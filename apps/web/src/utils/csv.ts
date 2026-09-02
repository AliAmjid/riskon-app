export interface CsvTable {
  headers: string[];
  /** Every row, as cell arrays in header order. */
  rows: string[][];
}

/**
 * Split a CSV into rows and cells.
 *
 * Written as a character scanner rather than a line split because the agent
 * quotes any field containing a comma — business rules routinely do — and a
 * quoted field may legally contain a newline of its own.
 */
export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let dirty = false;

  const endCell = (): void => {
    row.push(cell.trim());
    cell = '';
    dirty = true;
  };

  const endRow = (): void => {
    endCell();
    // A trailing newline should not produce a row of one empty cell.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    dirty = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') endCell();
    else if (char === '\r') continue;
    else if (char === '\n') endRow();
    else cell += char;
  }

  if (dirty || cell !== '') endRow();

  if (!rows.length) throw new Error('The CSV file is empty.');

  const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
  return { headers, rows: rows.slice(1) };
}

export type CsvRecord = Record<string, string>;

/** The same content keyed by header, which is what the panels want to read. */
export function parseCsvRecords(text: string): {
  headers: string[];
  records: CsvRecord[];
} {
  const { headers, rows } = parseCsv(text);
  const records = rows.map((row) => {
    const record: CsvRecord = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
  return { headers, records };
}

/** A capped view for previewing an arbitrary CSV we know nothing about. */
export function parseCSV(text: string, maxColumns = 8, maxRows = 5) {
  const { headers, rows } = parseCsv(text);
  const shown = headers.slice(0, maxColumns);
  return {
    rowCount: rows.length,
    columnCount: headers.length,
    headers: shown,
    rows: rows.slice(0, maxRows).map((row) => shown.map((_, index) => row[index] ?? '')),
  };
}
