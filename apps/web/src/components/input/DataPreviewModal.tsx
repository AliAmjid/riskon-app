import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DataAttachment } from '../../types/risksense';
import {
  queryPreview,
  resetPreviewCache,
  type PreviewPage,
} from '../../utils/duckdbPreview';

interface Props {
  attachment: DataAttachment;
  onClose: () => void;
}

const PAGE_SIZE = 50;

export function DataPreviewModal({ attachment, onClose }: Props) {
  const [page, setPage] = useState<PreviewPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string | undefined>();
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resetPreviewCache();
    setOffset(0);
    setOrderBy(undefined);
    setOrderDir('asc');
  }, [attachment.id, attachment.filename, attachment.url, attachment.file]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void queryPreview(attachment, { offset, limit: PAGE_SIZE, orderBy, orderDir })
      .then((next) => {
        if (!cancelled) setPage(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPage(null);
          setError(
            cause instanceof Error ? cause.message : 'Could not open that file.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment, offset, orderBy, orderDir]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function toggleSort(column: string) {
    if (orderBy === column) {
      setOrderDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(column);
      setOrderDir('asc');
    }
    setOffset(0);
  }

  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = page ? Math.max(1, Math.ceil(page.rowCount / PAGE_SIZE)) : 1;

  return createPortal(
    <div className="preview-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="preview-modal-head">
          <div>
            <h2 id="preview-modal-title">{attachment.filename}</h2>
            <p>
              Opened in this browser with DuckDB — the file was not transformed
              on the server.
            </p>
          </div>
          <button className="preview-modal-close" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <p className="banner-error">{error}</p>}

        {loading && !page && (
          <p className="preview-modal-status">Reading the file…</p>
        )}

        {page && (
          <>
            <p className="preview-modal-meta">
              {page.rowCount.toLocaleString()} rows × {page.columns.length} columns
              {page.tableName !== 'preview'
                ? ` · ${page.tableName.replace(/"/g, '').split('.').pop()}`
                : ''}
              {loading ? ' · updating…' : ''}
            </p>
            <div className="preview-modal-table">
              <table>
                <thead>
                  <tr>
                    {page.columns.map((column) => (
                      <th key={column}>
                        <button
                          type="button"
                          className="preview-sort"
                          onClick={() => toggleSort(column)}
                        >
                          {column}
                          {orderBy === column ? (orderDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row, rowIndex) => (
                    <tr key={`r-${offset + rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="preview-modal-pager">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              >
                Previous
              </button>
              <span>
                Page {pageNumber} of {pageCount}
              </span>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= page.rowCount || loading}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
              >
                Next
              </button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
