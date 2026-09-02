import type {
  AgentRunSummary,
  AnswerQuestionsRequest,
  CreateRunRequest,
  DatasetSummary,
  RunArtifactSummary,
  RunEventPayload,
  RunQuestionRequest,
} from '@riskon/shared';

/**
 * In development this is `/api`, proxied to the API by Vite (see vite.config).
 * Set VITE_API_URL to point at a deployed API instead.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Nest returns `{ message }` (or `{ message: string[] }` from the validation
 * pipe) on failure. Surfacing that beats "Request failed: 400", because these
 * messages are written for the person reading them.
 */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = body.message;
    if (Array.isArray(message)) return message.join('. ');
    if (message) return message;
  } catch {
    // Not JSON; fall through to the status line.
  }
  return `Request failed (${response.status}).`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export function getDataset(id: string): Promise<DatasetSummary> {
  return request(`/datasets/${id}`);
}

export function datasetRawHref(id: string): string {
  return `${API_BASE}/datasets/${id}/raw`;
}

export async function uploadDataset(file: File): Promise<DatasetSummary> {
  const form = new FormData();
  form.append('file', file);
  // No Content-Type header: the browser must set the multipart boundary.
  const response = await fetch(`${API_BASE}/datasets`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as DatasetSummary;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export function listRuns(): Promise<AgentRunSummary[]> {
  return request('/runs');
}

export function getRun(id: string): Promise<AgentRunSummary> {
  return request(`/runs/${id}`);
}

export function createRun(body: CreateRunRequest): Promise<AgentRunSummary> {
  return request('/runs', { method: 'POST', body: JSON.stringify(body) });
}

export function continueRun(
  id: string,
  message: string,
): Promise<AgentRunSummary> {
  return request(`/runs/${id}/continue`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function listRunEvents(id: string): Promise<RunEventPayload[]> {
  return request(`/runs/${id}/events`);
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export function listArtifacts(runId: string): Promise<RunArtifactSummary[]> {
  return request(`/runs/${runId}/artifacts`);
}

export function previewArtifact(
  runId: string,
  artifactId: string,
): Promise<{ path: string; contentType: string; text: string | null }> {
  return request(`/runs/${runId}/artifacts/${artifactId}/preview`);
}

export function artifactDownloadHref(
  runId: string,
  artifactId: string,
): string {
  return `${API_BASE}/runs/${runId}/artifacts/${artifactId}/raw`;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function listQuestions(runId: string): Promise<RunQuestionRequest[]> {
  return request(`/runs/${runId}/questions`);
}

export function answerQuestions(
  runId: string,
  requestId: string,
  body: AnswerQuestionsRequest,
): Promise<RunQuestionRequest> {
  return request(`/runs/${runId}/questions/${requestId}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function apiBaseUrl(): string {
  return API_BASE;
}
