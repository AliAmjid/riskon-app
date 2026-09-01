import type { DataPreview } from '../../types/risksense';

interface Props {
  preview: DataPreview;
}

const defaultPreview: DataPreview = {
  rowCount: 1247,
  columnCount: 12,
  headers: ['Carat', 'Cut', 'Color', 'Clarity', 'Depth', 'Price'],
  rows: [
    ['0.23', 'Ideal', 'E', 'SI2', '61.5', '326'],
    ['0.21', 'Premium', 'E', 'SI1', '59.6', '326'],
    ['0.23', 'Good', 'E', 'VS1', '56.9', '327'],
    ['0.29', 'Premium', 'I', 'VS2', '62.4', '337'],
    ['0.31', 'Good', 'J', 'VVS2', '62.8', '335'],
  ],
};

export function DataPreviewCard({ preview }: Props) {
  const data = preview.headers.length ? preview : defaultPreview;
  const meta =
    preview.fileName && !preview.headers.length
      ? 'Spreadsheet selected'
      : `${data.rowCount.toLocaleString()} rows × ${data.columnCount} columns`;

  return (
    <section className="preview-card" aria-labelledby="preview-heading">
      <div className="card-heading">
        <h2 id="preview-heading">Active Data Preview</h2>
        <span className="table-meta">{meta}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {data.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
