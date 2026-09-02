import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AgentRunSummary,
  AnswerQuestionsRequest,
  RunArtifactSummary,
  RunEventPayload,
  RunQuestionRequest,
  RunUpdatedMessage,
} from '@riskon/shared';
import {
  answerQuestions,
  getRun,
  listArtifacts,
  listQuestions,
  listRunEvents,
} from '../api';

function socketUrl(): string {
  // With no explicit API URL we are behind the Vite dev proxy, which forwards
  // /socket.io to the API, so the page's own origin is correct.
  return import.meta.env.VITE_API_URL ?? window.location.origin;
}

export interface RunState {
  run: AgentRunSummary | null;
  events: RunEventPayload[];
  artifacts: RunArtifactSummary[];
  questions: RunQuestionRequest[];
  /** The round the agent is blocked on, if any. */
  pendingQuestion: RunQuestionRequest | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  answer: (requestId: string, body: AnswerQuestionsRequest) => Promise<void>;
  refresh: () => Promise<void>;
  applyRun: (next: AgentRunSummary) => void;
}

/**
 * Everything about one run, kept current.
 *
 * REST provides the state as it stands when the run is opened; the socket
 * carries every change after that. Both are needed: a run opened halfway
 * through would otherwise show an empty timeline, and polling for a stream that
 * can be pushed is wasteful.
 */
export function useRun(runId: string | null): RunState {
  const [run, setRun] = useState<AgentRunSummary | null>(null);
  const [events, setEvents] = useState<RunEventPayload[]>([]);
  const [artifacts, setArtifacts] = useState<RunArtifactSummary[]>([]);
  const [questions, setQuestions] = useState<RunQuestionRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow fetch for a previous run overwriting the current one.
  const activeRunId = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [nextRun, nextEvents, nextArtifacts, nextQuestions] =
        await Promise.all([
          getRun(id),
          listRunEvents(id),
          listArtifacts(id),
          listQuestions(id),
        ]);
      if (activeRunId.current !== id) return;
      setRun(nextRun);
      setEvents(nextEvents);
      setArtifacts(nextArtifacts);
      setQuestions(nextQuestions);
    } catch (cause) {
      if (activeRunId.current !== id) return;
      setError(cause instanceof Error ? cause.message : 'Could not load this run.');
    } finally {
      if (activeRunId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRunId.current = runId;
    if (!runId) {
      setRun(null);
      setEvents([]);
      setArtifacts([]);
      setQuestions([]);
      return;
    }
    void load(runId);
  }, [runId, load]);

  useEffect(() => {
    if (!runId) return;

    const socket: Socket = io(socketUrl(), {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('run:subscribe', { runId });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('run:event', (event: RunEventPayload) => {
      // The socket can redeliver on reconnect, and the initial REST fetch may
      // race with the first pushed events.
      setEvents((current) =>
        current.some((existing) => existing.id === event.id)
          ? current
          : [...current, event],
      );
    });

    socket.on('run:updated', (patch: RunUpdatedMessage) => {
      setRun((current) =>
        current && current.id === patch.runId
          ? {
              ...current,
              status: patch.status ?? current.status,
              result: patch.result ?? current.result,
              errorMessage: patch.errorMessage ?? current.errorMessage,
              artifactCount: patch.artifactCount ?? current.artifactCount,
            }
          : current,
      );
    });

    const upsertQuestion = (round: RunQuestionRequest): void => {
      setQuestions((current) => {
        const index = current.findIndex((existing) => existing.id === round.id);
        if (index === -1) return [...current, round];
        const next = [...current];
        next[index] = round;
        return next;
      });
    };

    socket.on('run:question', upsertQuestion);
    socket.on('run:question-resolved', upsertQuestion);

    socket.on('run:artifact', (artifact: RunArtifactSummary) => {
      setArtifacts((current) => {
        const index = current.findIndex(
          (existing) => existing.path === artifact.path,
        );
        if (index === -1) return [...current, artifact];
        const next = [...current];
        next[index] = artifact;
        return next;
      });
    });

    return () => {
      socket.emit('run:unsubscribe', { runId });
      socket.disconnect();
      setConnected(false);
    };
  }, [runId]);

  const answer = useCallback(
    async (requestId: string, body: AnswerQuestionsRequest) => {
      if (!runId) return;
      const updated = await answerQuestions(runId, requestId, body);
      setQuestions((current) =>
        current.map((round) => (round.id === updated.id ? updated : round)),
      );
    },
    [runId],
  );

  const refresh = useCallback(async () => {
    if (runId) await load(runId);
  }, [runId, load]);

  const applyRun = useCallback((next: AgentRunSummary) => {
    if (activeRunId.current !== next.id) return;
    setRun(next);
  }, []);

  const pendingQuestion = useMemo(
    () => questions.find((round) => round.status === 'pending') ?? null,
    [questions],
  );

  return {
    run,
    events,
    artifacts,
    questions,
    pendingQuestion,
    connected,
    loading,
    error,
    answer,
    refresh,
    applyRun,
  };
}
