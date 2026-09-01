export type RunStatus =
  | 'pending'
  | 'running'
  | 'finished'
  | 'error'
  | 'cancelled';

export type AgentRuntime = 'local' | 'cloud';

export interface CreateRunRequest {
  title: string;
  businessQuestion: string;
  dataSource?: string;
  template?: string;
  runtime?: AgentRuntime;
  repositoryUrl?: string;
}

export interface AgentRunSummary {
  id: string;
  title: string;
  status: RunStatus;
  businessQuestion: string;
  dataSource: string | null;
  template: string | null;
  runtime: AgentRuntime;
  cursorAgentId: string | null;
  cursorRunId: string | null;
  result: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface RunEventPayload {
  id: string;
  runId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface ArtifactSummary {
  id: string;
  runId: string;
  path: string;
  sizeBytes: number;
  storageKey: string | null;
  downloadUrl: string | null;
  createdAt: string;
}
