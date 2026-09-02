import type { DataAttachment } from '../../types/risksense';

interface Props {
  attachment: DataAttachment;
  onOpen: () => void;
  onRemove?: () => void;
}

function formatSize(bytes?: number): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

export function DatasetChip({ attachment, onOpen, onRemove }: Props) {
  const rows =
    attachment.rowCountEstimate != null
      ? `≈${attachment.rowCountEstimate.toLocaleString()} rows`
      : null;
  const size = formatSize(attachment.sizeBytes);
  const hint = [attachment.filename, rows, size].filter(Boolean).join(' · ');

  return (
    <div className="dataset-tile">
      <button
        className="dataset-icon"
        type="button"
        onClick={onOpen}
        title={`${hint} — click to open`}
        aria-label={`Open ${attachment.filename}`}
      >
        <FileIcon />
      </button>
      <span className="dataset-icon-name" title={attachment.filename}>
        {attachment.filename}
      </span>
      {onRemove && (
        <button
          className="dataset-icon-remove"
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.filename}`}
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
}
