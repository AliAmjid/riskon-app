/**
 * The contract between the API and the web app.
 *
 * A run moves through this lifecycle:
 *
 *   pending -> running -> (awaiting_input <-> running)* -> finished | error
 *
 * `awaiting_input` is the interesting one: the agent has reached a question it
 * cannot answer from the data and is blocked on the stakeholder. Nothing else
 * about the run changes while it sits there.
 */
export type RunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'finished'
  | 'error'
  | 'cancelled';

/**
 * Artifacts and the question channel are cloud-only: the Cursor SDK returns no
 * artifacts for local agents, and a local agent has no reachable MCP endpoint.
 * `local` stays available for debugging the prompt without burning a cloud run.
 */
export type AgentRuntime = 'local' | 'cloud';

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

/**
 * An uploaded file, held so a cloud agent can fetch it over HTTP. A cloud run
 * has no access to the caller's filesystem, so `downloadUrl` (absolute, built
 * from PUBLIC_BASE_URL) is the only way the agent can see the data.
 */
export interface DatasetSummary {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  rowCountEstimate: number | null;
  downloadUrl: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface ContinueRunRequest {
  message: string;
}

export interface CreateRunRequest {
  title: string;
  businessQuestion: string;
  /** Preferred over `dataSource`: an uploaded dataset the agent can fetch. */
  datasetId?: string;
  /** Every uploaded file for this run. `datasetId` is treated as the first. */
  datasetIds?: string[];
  /** A URL the agent can load directly, when there is nothing to upload. */
  dataSource?: string;
  template?: string;
  runtime?: AgentRuntime;
  /** Defaults to the configured agent repository. */
  repositoryUrl?: string;
  startingRef?: string;
}

export interface AgentRunSummary {
  id: string;
  title: string;
  status: RunStatus;
  businessQuestion: string;
  dataSource: string | null;
  datasetId: string | null;
  datasetIds: string[];
  template: string | null;
  runtime: AgentRuntime;
  repositoryUrl: string | null;
  cursorAgentId: string | null;
  cursorRunId: string | null;
  result: string | null;
  errorMessage: string | null;
  artifactCount: number;
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

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/**
 * A file the agent published, already copied out of the agent's workspace and
 * into our own storage. Cursor's download URLs expire after 15 minutes, so
 * everything is pulled once when the run ends and served from here afterwards.
 */
export interface RunArtifactSummary {
  id: string;
  runId: string;
  /** Path as the agent published it, with the `artifacts/` prefix removed. */
  path: string;
  contentType: string;
  sizeBytes: number;
  /** Absolute URL on this API. Stable, unlike Cursor's presigned URLs. */
  downloadUrl: string;
  /** True for text we are willing to render inline (reports, CSVs). */
  isPreviewable: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface RunQuestionOption {
  value: string;
  label: string;
}

export interface RunQuestion {
  /** Agent-chosen slug, e.g. `budget`. Answers are keyed by this. */
  id: string;
  question: string;
  whyItMatters: string | null;
  /** The answer the stakeholder can accept with one word. */
  recommended: string | null;
  /** Shown next to a free-text answer, e.g. `USD`, `carats`. */
  unit: string | null;
  /** When present, render as choices rather than a text field. */
  options: RunQuestionOption[] | null;
}

/**
 * `pending` while the agent is blocked. `declined` means the stakeholder chose
 * "you decide"; `timeout` means nobody was there. The agent treats the three
 * terminal states differently in its assumption ledger, so they stay distinct.
 */
export type QuestionRequestStatus =
  | 'pending'
  | 'answered'
  | 'declined'
  | 'timeout'
  | 'cancelled';

export interface RunQuestionRequest {
  id: string;
  runId: string;
  status: QuestionRequestStatus;
  /** Free-text preamble from the agent, shown above the questions. */
  intro: string | null;
  questions: RunQuestion[];
  /** Keyed by `RunQuestion.id`. Null until answered. */
  answers: Record<string, string> | null;
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AnswerQuestionsRequest {
  /** Keyed by `RunQuestion.id`. Ignored when `decline` is true. */
  answers?: Record<string, string>;
  /** The "you decide" exit: the agent proceeds on its own recommendations. */
  decline?: boolean;
}

// ---------------------------------------------------------------------------
// Realtime channel (Socket.IO)
// ---------------------------------------------------------------------------

/** Client -> server. Joins the room for one run. */
export interface RunSubscribeMessage {
  runId: string;
}

export interface RunUpdatedMessage {
  runId: string;
  status?: RunStatus;
  result?: string | null;
  errorMessage?: string | null;
  artifactCount?: number;
}

export interface ServerToClientEvents {
  'run:subscribed': (payload: { runId: string }) => void;
  'run:event': (payload: RunEventPayload) => void;
  'run:updated': (payload: RunUpdatedMessage) => void;
  /** A question round opened; the run is now blocked on the stakeholder. */
  'run:question': (payload: RunQuestionRequest) => void;
  /** The same round, now terminal. */
  'run:question-resolved': (payload: RunQuestionRequest) => void;
  /** One file finished downloading out of the agent's workspace. */
  'run:artifact': (payload: RunArtifactSummary) => void;
}
