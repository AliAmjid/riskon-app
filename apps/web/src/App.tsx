import { useEffect, useState } from 'react';
import type { AgentRunSummary } from '@riskon/shared';
import { listRuns } from './api';
import { NewRunForm } from './components/NewRunForm';
import { RunDetail } from './components/RunDetail';

export default function App() {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshRuns() {
    const data = await listRuns();
    setRuns(data);
    setLoading(false);
  }

  useEffect(() => {
    void refreshRuns();
    const interval = setInterval(() => void refreshRuns(), 8000);
    return () => clearInterval(interval);
  }, []);

  if (selectedRunId) {
    return (
      <div className="page">
        <RunDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Riskon</h1>
        <p>Operations Research runs powered by the riskon-agent and Cursor SDK.</p>
      </header>

      <div className="layout">
        <NewRunForm
          onCreated={(runId) => {
            void refreshRuns();
            setSelectedRunId(runId);
          }}
        />

        <section className="card">
          <div className="row">
            <h2>Recent runs</h2>
            <button type="button" className="link" onClick={() => void refreshRuns()}>
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="muted">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="muted">No runs yet. Start one above.</p>
          ) : (
            <ul className="runs">
              {runs.map((run) => (
                <li key={run.id}>
                  <button type="button" className="run-row" onClick={() => setSelectedRunId(run.id)}>
                    <span>
                      <strong>{run.title}</strong>
                      <small>{new Date(run.createdAt).toLocaleString()}</small>
                    </span>
                    <span className={`badge badge-${run.status}`}>{run.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
