function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseCSV(text: string, maxColumns = 8, maxRows = 5) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    throw new Error('The CSV file is empty.');
  }

  const rows = lines.map(parseCSVLine);
  const headers = rows[0].slice(0, maxColumns);
  const preview = rows.slice(1, maxRows + 1).map((row) =>
    headers.map((_, index) => row[index] ?? ''),
  );

  return {
    rowCount: rows.length - 1,
    columnCount: rows[0].length,
    headers: headers.map((header) => header || 'Unnamed'),
    rows: preview,
  };
}
