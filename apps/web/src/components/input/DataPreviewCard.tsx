import type { DataPreview } from '../../types/risksense';

interface Props {
  preview: DataPreview;
}

export function DataPreviewCard({ preview }: Props) {
  const hasPreview = preview.headers.length > 0;
  const meta =
    preview.fileName && !hasPreview
      ? 'Spreadsheet selected'
      : hasPreview
        ? `${preview.rowCount.toLocaleString()} rows × ${preview.columnCount} columns`
        : 'No data uploaded';

  return (
    <section className="preview-card" aria-labelledby="preview-heading">
      <div className="card-heading">
        <h2 id="preview-heading">Active Data Preview</h2>
        <span className="table-meta">{meta}</span>
      </div>

      {hasPreview ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {preview.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="preview-empty">
          Upload a CSV or spreadsheet to preview the first rows here.
        </div>
      )}
    </section>
  );
}
