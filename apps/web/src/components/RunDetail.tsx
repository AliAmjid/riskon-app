import { useEffect, useState } from 'react';
import type { AgentRunSummary, RunEventPayload } from '@riskon/shared';
import { getRun, listRunEvents } from '../api';
import { useRunEvents } from '../hooks/useRunEvents';

interface Props {
  runId: string;
  onBack: () => void;
}

export function RunDetail({ runId, onBack }: Props) {
  const [run, setRun] = useState<AgentRunSummary | null>(null);
  const [history, setHistory] = useState<RunEventPayload[]>([]);
  const { events: liveEvents, connected } = useRunEvents(runId);

  useEffect(() => {
    void getRun(runId).then(setRun);
    void listRunEvents(runId).then(setHistory);
  }, [runId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void getRun(runId).then(setRun);
    }, 5000);
    return () => clearInterval(interval);
  }, [runId]);

  const allEvents = [...history, ...liveEvents.filter((e) => !history.some((h) => h.id === e.id))];

  return (
    <section className="stack">
      <button type="button" className="link" onClick={onBack}>
        ← Back to runs
      </button>

      {run && (
        <header className="card">
          <div className="row">
            <h2>{run.title}</h2>
            <span className={`badge badge-${run.status}`}>{run.status}</span>
          </div>
          <p>{run.businessQuestion}</p>
          <dl className="meta">
            <div><dt>Runtime</dt><dd>{run.runtime}</dd></div>
            <div><dt>Agent</dt><dd>{run.cursorAgentId ?? '—'}</dd></div>
            <div><dt>Run</dt><dd>{run.cursorRunId ?? '—'}</dd></div>
            <div><dt>WebSocket</dt><dd>{connected ? 'connected' : 'disconnected'}</dd></div>
          </dl>
          {run.result && (
            <pre className="result">{run.result}</pre>
          )}
          {run.errorMessage && (
            <p className="error">{run.errorMessage}</p>
          )}
        </header>
      )}

      <div className="grid">
        <div className="card">
          <h3>Live events ({allEvents.length})</h3>
          <ul className="events">
            {allEvents.slice(-50).map((event) => (
              <li key={event.id}>
                <code>{event.eventType}</code>
                <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
}
