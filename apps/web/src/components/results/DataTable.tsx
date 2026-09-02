import type { CsvRecord } from '../../utils/csv';
import { formatNumber, toBool, toNumber } from '../../utils/runResult';

interface Props {
  columns: string[];
  rows: CsvRecord[];
  numericColumns?: string[];
  /** Column headers rewritten for a reader, keyed by raw name. */
  headings?: Record<string, string>;
  maxRows?: number;
}

/** Column names that should not be sentence-cased into nonsense. */
const ACRONYMS: Record<string, string> = {
  mpg: 'MPG',
  id: 'ID',
  row_id: 'Row',
  co2: 'CO2',
};

/** `unit_cost` is a column name; "Unit cost" is a heading. */
function humanise(column: string): string {
  const key = column.toLowerCase();
  if (ACRONYMS[key]) return ACRONYMS[key];
  const words = column.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `249648.0` in a cell is noise; `249,648` is the number. */
function present(raw: string, numeric: boolean): string {
  if (raw === '' || raw.toLowerCase() === 'none') return '—';
  if (numeric) {
    const value = toNumber(raw);
    if (value != null) return formatNumber(value);
  }
  const flag = toBool(raw);
  if (flag !== null && /^(true|false)$/i.test(raw.trim())) return flag ? 'Yes' : 'No';
  return raw;
}

export function DataTable({
  columns,
  rows,
  numericColumns = [],
  headings = {},
  maxRows = 300,
}: Props) {
  const shown = rows.slice(0, maxRows);

  return (
    <>
      {rows.length > shown.length && (
        <p className="artifact-meta">
          Showing the first {formatNumber(shown.length)} of{' '}
          {formatNumber(rows.length)} rows. Download the file for the rest.
        </p>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className={numericColumns.includes(column) ? 'numeric' : undefined}
                >
                  {headings[column] ?? humanise(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={`${row.row_id ?? index}`}>
                {columns.map((column) => {
                  const numeric = numericColumns.includes(column);
                  return (
                    <td key={column} className={numeric ? 'numeric' : undefined}>
                      {present(row[column] ?? '', numeric)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
