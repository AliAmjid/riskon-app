import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AgentRunSummary,
  AnswerQuestionsRequest,
  DatasetSummary,
} from '@riskon/shared';
import { AppShell, InputView, ResultsView } from './components';
import {
  createRun,
  continueRun,
  datasetRawHref,
  getDataset,
  listRuns,
  uploadDataset,
} from './api';
import { useRun } from './hooks/useRun';
import { toActivity, lastAgentMessage } from './utils/runEvents';
import type { DataAttachment, SessionSummary, WorkspaceView } from './types/risksense';

/** A run's title, derived from its question so the sidebar reads sensibly. */
function titleFor(question: string): string {
  const firstSentence = question.split(/[.?!\n]/)[0].trim();
  const title = firstSentence || question.trim();
  return title.length > 70 ? `${title.slice(0, 67)}…` : title;
}

function idsFor(run: AgentRunSummary): string[] {
  if (run.datasetIds?.length) return run.datasetIds;
  return run.datasetId ? [run.datasetId] : [];
}

interface Upload {
  dataset: DatasetSummary;
  file?: File;
}

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('chat');
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    run,
    events,
    artifacts,
    pendingQuestion,
    answer,
    error: runError,
    applyRun,
  } = useRun(activeRunId);

  const refreshRuns = useCallback(async () => {
    try {
      setRuns(await listRuns());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not reach the API. Is it running?',
      );
    }
  }, []);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  useEffect(() => {
    if (!run) return;
    setRuns((current) =>
      current.map((existing) => (existing.id === run.id ? run : existing)),
    );
  }, [run]);

  // When opening an existing run, recover the files it was started with so the
  // chat chips still open. Prefer the local File while this tab just uploaded it.
  useEffect(() => {
    if (!run) return;
    const ids = idsFor(run);
    if (ids.length === 0) {
      setUploads([]);
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((id) => getDataset(id)))
      .then((rows) => {
        if (cancelled) return;
        setUploads((current) => {
          const files = new Map(
            current.map((item) => [item.dataset.id, item.file]),
          );
          return rows.map((dataset) => ({
            dataset,
            file: files.get(dataset.id),
          }));
        });
      })
      .catch(() => {
        if (!cancelled) setUploads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);

  const working =
    starting || run?.status === 'pending' || run?.status === 'running';

  const activity = useMemo(
    () =>
      toActivity(events, {
        openingQuestion: run?.businessQuestion,
        stillWorking: working,
      }),
    [events, run?.businessQuestion, working],
  );
  const headline = useMemo(
    () => run?.result ?? lastAgentMessage(activity),
    [run, activity],
  );

  const resultsReady =
    activeRunId != null &&
    (run?.status === 'finished' || (run != null && run.artifactCount > 0));

  const sessions: SessionSummary[] = useMemo(
    () =>
      runs.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt,
        status: item.status,
      })),
    [runs],
  );

  const attachments: DataAttachment[] = useMemo(
    () =>
      uploads.map((item) => ({
        id: item.dataset.id,
        filename: item.dataset.filename,
        file: item.file,
        url: datasetRawHref(item.dataset.id),
        rowCountEstimate: item.dataset.rowCountEstimate,
        sizeBytes: item.file?.size ?? item.dataset.sizeBytes,
      })),
    [uploads],
  );

  const handleFilesSelected = useCallback(async (files: File[]) => {
    setUploading(true);
    setError(null);

    const next: Upload[] = [];
    try {
      for (const file of files) {
        next.push({ dataset: await uploadDataset(file), file });
      }
      setUploads((current) => {
        const merged = [...current];
        for (const item of next) {
          const index = merged.findIndex(
            (existing) => existing.dataset.filename === item.dataset.filename,
          );
          if (index >= 0) merged[index] = item;
          else merged.push(item);
        }
        return merged;
      });
    } catch (cause) {
      if (next.length > 0) {
        setUploads((current) => [...current, ...next]);
      }
      setError(cause instanceof Error ? cause.message : 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setUploads((current) => current.filter((item) => item.dataset.id !== id));
  }, []);

  const handleAskQuestion = useCallback(
    async (question: string) => {
      setStarting(true);
      setError(null);
      try {
        if (activeRunId) {
          if (
            run?.status === 'pending' ||
            run?.status === 'running' ||
            run?.status === 'awaiting_input'
          ) {
            setError(
              'This session is still working. Wait for it to finish, or answer the question first.',
            );
            return;
          }
          if (!run?.cursorAgentId) {
            setError(
              'This session cannot be continued. Start a new one from the + button.',
            );
            return;
          }
          const updated = await continueRun(activeRunId, question);
          applyRun(updated);
          setRuns((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
          return;
        }

        const datasetIds = uploads.map((item) => item.dataset.id);
        const created = await createRun({
          title: titleFor(question),
          businessQuestion: question,
          datasetId: datasetIds[0],
          datasetIds,
          runtime: 'cloud',
        });
        setRuns((current) => [created, ...current]);
        setActiveRunId(created.id);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not start the run.',
        );
      } finally {
        setStarting(false);
      }
    },
    [uploads, activeRunId, run, applyRun],
  );

  const handleAnswerQuestion = useCallback(
    async (body: AnswerQuestionsRequest) => {
      if (!pendingQuestion) return;
      await answer(pendingQuestion.id, body);
    },
    [pendingQuestion, answer],
  );

  const handleNewSession = useCallback(() => {
    setActiveRunId(null);
    setUploads([]);
    setError(null);
    setActiveView('chat');
  }, []);

  const handleSelectSession = useCallback((runId: string) => {
    setActiveRunId(runId);
    setUploads([]);
    setError(null);
    setActiveView('chat');
  }, []);

  const handleViewChange = useCallback(
    (view: WorkspaceView) => {
      if (view === 'results' && !resultsReady) return;
      setActiveView(view);
    },
    [resultsReady],
  );

  useEffect(() => {
    if (activeView === 'results' && !resultsReady) {
      setActiveView('chat');
    }
  }, [activeView, resultsReady]);

  const agentStatus =
    pendingQuestion !== null ? 'offline' : working ? 'busy' : 'ready';

  return (
    <AppShell
      activeView={activeView}
      onViewChange={handleViewChange}
      resultsReady={resultsReady}
      sessions={sessions}
      activeSessionId={activeRunId ?? ''}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      agentStatus={agentStatus}
      agentStatusLabel={
        pendingQuestion !== null ? 'Waiting on you' : undefined
      }
      chatView={
        <InputView
          attachments={attachments}
          activity={activity}
          pendingQuestion={pendingQuestion}
          working={working}
          uploading={uploading}
          runLocked={activeRunId !== null}
          continueMode={
            activeRunId != null &&
            !!run?.cursorAgentId &&
            (run.status === 'finished' || run.status === 'error')
          }
          error={error ?? runError}
          onFilesSelected={(files) => void handleFilesSelected(files)}
          onRemoveAttachment={handleRemoveAttachment}
          onAskQuestion={(question) => void handleAskQuestion(question)}
          onAnswerQuestion={handleAnswerQuestion}
        />
      }
      resultsView={
        <ResultsView run={run} artifacts={artifacts} headline={headline} />
      }
    />
  );
}
