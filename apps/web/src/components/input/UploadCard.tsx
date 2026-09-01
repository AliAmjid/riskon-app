import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { DataPreview } from '../../types/risksense';
import { parseCSV } from '../../utils/csv';

interface Props {
  fileName?: string;
  onPreview: (preview: DataPreview) => void;
  onError?: (message: string) => void;
}

function UploadIcon() {
  return (
    <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 16V5m0 0-4 4m4-4 4 4" />
      <path d="M5 15a4 4 0 0 1 .7-7.94A6 6 0 0 1 17.3 8.5 3.5 3.5 0 0 1 18 15" />
    </svg>
  );
}

export function UploadCard({ fileName = 'No file selected', onPreview, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedName, setSelectedName] = useState(fileName);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setSelectedName(file.name);

    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      try {
        const parsed = parseCSV(await file.text());
        onPreview({ ...parsed, fileName: file.name });
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Could not preview this CSV.');
      }
      return;
    }

    onPreview({
      rowCount: 0,
      columnCount: 0,
      headers: [],
      rows: [],
      fileName: file.name,
    });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
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
      <p>Drag &amp; drop a CSV or XLSX file</p>
      <label className="file-button" htmlFor="csv-file">
        Browse files
      </label>
      <input
        ref={inputRef}
        className="sr-only"
        id="csv-file"
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        onChange={onInputChange}
      />
      <div className="file-name">{selectedName}</div>
    </section>
  );
}
