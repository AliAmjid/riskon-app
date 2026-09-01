import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AgentRunSummary,
  AnswerQuestionsRequest,
  DatasetSummary,
} from '@riskon/shared';
import { AppShell, InputView, ResultsView } from './components';
import { createRun, listRuns, uploadDataset } from './api';
import { useRun } from './hooks/useRun';
import { toActivity, lastAgentMessage } from './utils/runEvents';
import { parseCSV } from './utils/csv';
import type { DataPreview, SessionSummary, WorkspaceView } from './types/risksense';

const EMPTY_PREVIEW: DataPreview = {
  rowCount: 0,
  columnCount: 0,
  headers: [],
  rows: [],
};

/** A run's title, derived from its question so the sidebar reads sensibly. */
function titleFor(question: string): string {
  const firstSentence = question.split(/[.?!\n]/)[0].trim();
  const title = firstSentence || question.trim();
  return title.length > 70 ? `${title.slice(0, 67)}…` : title;
}

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('input');
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [preview, setPreview] = useState<DataPreview>(EMPTY_PREVIEW);
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

  // Keep the sidebar's copy of the active run in step with the live one, so its
  // status and title do not go stale while a run progresses.
  useEffect(() => {
    if (!run) return;
    setRuns((current) =>
      current.map((existing) => (existing.id === run.id ? run : existing)),
    );
  }, [run]);

  const activity = useMemo(() => toActivity(events), [events]);
  const headline = useMemo(
    () => run?.result ?? lastAgentMessage(activity),
    [run, activity],
  );

  const working =
    starting || run?.status === 'pending' || run?.status === 'running';

  const sessions: SessionSummary[] = useMemo(
    () =>
      runs.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt,
      })),
    [runs],
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleFileSelected = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);

    // Preview locally for immediate feedback; the upload is what the agent uses.
    if (/\.(csv|tsv|txt)$/i.test(file.name)) {
      try {
        setPreview({ ...parseCSV(await file.text()), fileName: file.name });
      } catch {
        setPreview({ ...EMPTY_PREVIEW, fileName: file.name });
      }
    } else {
      setPreview({ ...EMPTY_PREVIEW, fileName: file.name });
    }

    try {
      setDataset(await uploadDataset(file));
    } catch (cause) {
      setDataset(null);
      setError(cause instanceof Error ? cause.message : 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleAskQuestion = useCallback(
    async (question: string) => {
      setStarting(true);
      setError(null);
      try {
        const created = await createRun({
          title: titleFor(question),
          businessQuestion: question,
          datasetId: dataset?.id,
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
    [dataset],
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
    setDataset(null);
    setPreview(EMPTY_PREVIEW);
    setError(null);
    setActiveView('input');
  }, []);

  const handleSelectSession = useCallback((runId: string) => {
    setActiveRunId(runId);
    setError(null);
  }, []);

  const handleViewChange = useCallback((view: WorkspaceView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // A run that is waiting on an answer is not busy; it is blocked on the person
  // reading this, and the status pill should not claim otherwise.
  const agentStatus =
    pendingQuestion !== null ? 'offline' : working ? 'busy' : 'ready';

  return (
    <AppShell
      activeView={activeView}
      onViewChange={handleViewChange}
      sessions={sessions}
      activeSessionId={activeRunId ?? ''}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      agentStatus={agentStatus}
      agentStatusLabel={
        pendingQuestion !== null ? 'Waiting on you' : undefined
      }
      inputView={
        <InputView
          title={run?.title ?? 'New optimisation session'}
          preview={preview}
          activity={activity}
          pendingQuestion={pendingQuestion}
          working={working}
          uploading={uploading}
          datasetLabel={dataset?.filename ?? null}
          error={error ?? runError}
          onFileSelected={(file) => void handleFileSelected(file)}
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
