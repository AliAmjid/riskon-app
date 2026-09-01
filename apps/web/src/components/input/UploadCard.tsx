import { useState, type ChangeEvent, type DragEvent } from 'react';

interface Props {
  fileName?: string;
  uploading?: boolean;
  onFileSelected: (file: File) => void;
}

function UploadIcon() {
  return (
    <svg
      className="upload-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M12 16V5m0 0-4 4m4-4 4 4" />
      <path d="M5 15a4 4 0 0 1 .7-7.94A6 6 0 0 1 17.3 8.5 3.5 3.5 0 0 1 18 15" />
    </svg>
  );
}

export function UploadCard({
  fileName = 'No file selected',
  uploading = false,
  onFileSelected,
}: Props) {
  const [dragging, setDragging] = useState(false);

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
    // Reset so selecting the same file twice still fires a change event.
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }

  return (
    <section
      className={`upload-card ${dragging ? 'dragging' : ''}`}
      aria-labelledby="upload-title"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <UploadIcon />
      <h2 id="upload-title">Upload Data</h2>
      <p>Drag &amp; drop a CSV, TSV or spreadsheet</p>
      <label className="file-button" htmlFor="csv-file">
        Browse files
      </label>
      <input
        className="sr-only"
        id="csv-file"
        type="file"
        accept=".csv,.tsv,.txt,.json,.jsonl,.parquet,.xlsx,.xls"
        onChange={onInputChange}
        disabled={uploading}
      />
      <div className="file-name">
        {uploading ? 'Uploading…' : fileName}
      </div>
    </section>
  );
}
