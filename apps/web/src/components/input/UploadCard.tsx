import { type ChangeEvent } from 'react';

interface Props {
  uploading?: boolean;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
}

export function UploadCard({
  uploading = false,
  disabled = false,
  onFilesSelected,
}: Props) {
  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? [...event.target.files] : [];
    if (files.length > 0) onFilesSelected(files);
    event.target.value = '';
  }

  return (
    <input
      className="sr-only"
      id="csv-file"
      type="file"
      multiple
      accept=".csv,.tsv,.txt,.json,.jsonl,.parquet,.xlsx,.xls"
      onChange={onInputChange}
      disabled={uploading || disabled}
    />
  );
}
