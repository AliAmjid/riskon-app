import type { RunStatus } from '@riskon/shared';

export type WorkspaceView = 'chat' | 'results';

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  status: RunStatus;
}

/** A file the chat can open in the DuckDB preview modal. */
export interface DataAttachment {
  id: string;
  filename: string;
  /** Local file just picked — preferred, no extra fetch. */
  file?: File;
  /** Same-origin URL for the uploaded dataset. */
  url?: string;
  rowCountEstimate?: number | null;
  sizeBytes?: number;
}

export interface KeyResult {
  label: string;
  value: string;
  /** One line of context, so the figure does not have to speak for itself. */
  note?: string;
}
