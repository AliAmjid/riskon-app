export type WorkspaceView = 'input' | 'results';

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DataPreview {
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: string[][];
  fileName?: string;
}

export interface KeyResult {
  label: string;
  value: string;
}
