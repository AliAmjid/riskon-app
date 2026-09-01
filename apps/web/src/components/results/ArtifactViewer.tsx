import { useEffect, useMemo, useState } from 'react';
import type { RunArtifactSummary } from '@riskon/shared';
import { previewArtifact } from '../../api';
import { renderMarkdown } from '../../utils/markdown';
import { parseCSV } from '../../utils/csv';

interface Props {
  artifact: RunArtifactSummary | null;
}

/** A CSV is far easier to read as a table than as text. */
function CsvTable({ text }: { text: string }) {
  const table = useMemo(() => {
    try {
      return parseCSV(text, 12, 200);
    } catch {
      return null;
    }
  }, [text]);

  if (!table) {
    return <pre className="artifact-raw">{text}</pre>;
  }

  return (
    <>
      <p className="artifact-meta">
        {table.rowCount.toLocaleString()} rows × {table.columnCount} columns
        {table.rows.length < table.rowCount &&
          ` · showing the first ${table.rows.length}`}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {table.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ArtifactViewer({ artifact }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact) {
      setText(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    previewArtifact(artifact.runId, artifact.id).then(
      (result) => {
        if (!cancelled) {
          setText(result.text);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'Could not open this file.',
          );
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [artifact]);

  if (!artifact) {
    return (
      <section className="panel">
        <p className="panel-kicker">Report</p>
        <p className="model-copy">
          Nothing selected. Pick a file to read it here.
        </p>
      </section>
    );
  }

  const isMarkdown = artifact.path.endsWith('.md');
  const isCsv = artifact.path.endsWith('.csv');

  return (
    <section className="panel">
      <p className="panel-kicker">{artifact.path}</p>

      {loading && <p className="model-copy">Opening…</p>}
      {error && <p className="banner-error">{error}</p>}

      {!loading && !error && text === null && (
        <p className="model-copy">
          This file is not text. Download it to open it.
        </p>
      )}

      {!loading && !error && text !== null && isMarkdown && (
        <div
          className="markdown-body"
          // Sanitised in renderMarkdown; the agent's output is not trusted.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      )}

      {!loading && !error && text !== null && isCsv && <CsvTable text={text} />}

      {!loading && !error && text !== null && !isMarkdown && !isCsv && (
        <pre className="artifact-raw">{text}</pre>
      )}
    </section>
  );
}
