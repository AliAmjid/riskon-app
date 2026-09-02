import { useEffect, useMemo, useState } from 'react';
import type { RunArtifactSummary } from '@riskon/shared';
import { previewArtifact } from '../../api';
import { renderMarkdown } from '../../utils/markdown';
import { parseCSV } from '../../utils/csv';
import { formatNumber } from '../../utils/runResult';

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
        {formatNumber(table.rowCount)} rows × {table.columnCount} columns
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
  /**
   * Keyed by the artifact it belongs to. A plain `text` plus `loading` pair
   * flashes "this file is not text" on the first paint of every file, because
   * the effect that starts the fetch runs after that paint.
   */
  const [loaded, setLoaded] = useState<{ id: string; text: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact) return;

    let cancelled = false;
    setError(null);

    previewArtifact(artifact.runId, artifact.id).then(
      (result) => {
        if (!cancelled) setLoaded({ id: artifact.id, text: result.text });
      },
      (cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'Could not open this file.',
          );
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [artifact]);

  const ready = artifact != null && loaded?.id === artifact.id;
  const text = ready ? loaded.text : null;

  if (!artifact) {
    return (
      <section className="panel">
        <p className="model-copy">
          Pick a file on the left to read it here, or download it to open it
          elsewhere.
        </p>
      </section>
    );
  }

  const isMarkdown = artifact.path.endsWith('.md');
  const isCsv = artifact.path.endsWith('.csv');

  return (
    <section className="panel">
      <p className="panel-kicker">{artifact.path}</p>

      {error ? (
        <p className="banner-error">{error}</p>
      ) : !ready ? (
        <p className="model-copy">Opening…</p>
      ) : text === null ? (
        <p className="model-copy">
          This file is not text. Download it to open it.
        </p>
      ) : isMarkdown ? (
        <div
          className="markdown-body"
          // Sanitised in renderMarkdown; the agent's output is not trusted.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      ) : isCsv ? (
        <CsvTable text={text} />
      ) : (
        <pre className="artifact-raw">{text}</pre>
      )}
    </section>
  );
}
