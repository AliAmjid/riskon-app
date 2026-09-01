import type { CreateRunRequest, AgentRunSummary, RunEventPayload } from '@riskon/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listRuns(): Promise<AgentRunSummary[]> {
  return request('/runs');
}

export function getRun(id: string): Promise<AgentRunSummary> {
  return request(`/runs/${id}`);
}

export function createRun(body: CreateRunRequest): Promise<AgentRunSummary> {
  return request('/runs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listRunEvents(id: string): Promise<RunEventPayload[]> {
  return request(`/runs/${id}/events`);
}

export function apiBaseUrl(): string {
  return API_BASE;
}
