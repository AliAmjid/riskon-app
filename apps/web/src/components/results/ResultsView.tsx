import { useEffect, useState } from 'react';
import type { AgentRunSummary, RunArtifactSummary } from '@riskon/shared';
import { ArtifactList } from './ArtifactList';
import { ArtifactViewer } from './ArtifactViewer';
import { KpiGrid } from './KpiGrid';

interface Props {
  run: AgentRunSummary | null;
  artifacts: RunArtifactSummary[];
  /** The agent's closing summary, which is the sentence to lead with. */
  headline: string | null;
}

const STATUS_COPY: Record<AgentRunSummary['status'], string> = {
  pending: 'Starting',
  running: 'Working',
  awaiting_input: 'Waiting on you',
  finished: 'Done',
  error: 'Stopped early',
  cancelled: 'Cancelled',
};

function formatDuration(run: AgentRunSummary): string {
  const end = run.completedAt ? new Date(run.completedAt) : new Date();
  const seconds = Math.max(
    0,
    Math.round((end.getTime() - new Date(run.createdAt).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function ResultsView({ run, artifacts, headline }: Props) {
  const [selected, setSelected] = useState<RunArtifactSummary | null>(null);

  // Default to the report: it is the one file written for the reader.
  useEffect(() => {
    setSelected((current) => {
      if (current && artifacts.some((a) => a.id === current.id)) return current;
      return (
        artifacts.find((a) => a.path === 'report.md') ??
        artifacts.find((a) => a.isPreviewable) ??
        null
      );
    });
  }, [artifacts]);

  if (!run) {
    return (
      <main className="results-workspace">
        <div className="results-header">
          <div>
            <h1>No run selected</h1>
            <p>Start one from Chat and the results will appear here.</p>
          </div>
        </div>
      </main>
    );
  }

  const waiting = run.status === 'pending' || run.status === 'running';

  return (
    <main className="results-workspace">
      <div className="results-header">
        <div>
          <h1>{run.title}</h1>
          <p>{run.businessQuestion}</p>
        </div>
      </div>

      <KpiGrid
        metrics={[
          { label: 'Status', value: STATUS_COPY[run.status] },
          { label: 'Files produced', value: String(run.artifactCount) },
          { label: 'Time taken', value: formatDuration(run) },
        ]}
      />

      <section className="panel">
        <p className="panel-kicker">Recommendation</p>
        {run.errorMessage ? (
          <p className="recommendation">{run.errorMessage}</p>
        ) : headline ? (
          <p className="recommendation">{headline}</p>
        ) : (
          <p className="model-copy">
            {waiting
              ? 'The agent is still working. This fills in as soon as it reports back.'
              : 'The agent did not leave a summary. Open the report below.'}
          </p>
        )}
      </section>

      {artifacts.length === 0 ? (
        <section className="panel">
          <h2>Files the agent produced</h2>
          <p className="model-copy">
            {waiting
              ? 'Nothing yet. Files appear here as soon as the agent publishes them.'
              : 'The agent published nothing. The activity feed on Chat shows how far it got.'}
          </p>
        </section>
      ) : (
        <div className="results-grid">
          <div className="results-column">
            <ArtifactList
              artifacts={artifacts}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </div>
          <div className="results-column">
            <ArtifactViewer artifact={selected} />
          </div>
        </div>
      )}
    </main>
  );
}
