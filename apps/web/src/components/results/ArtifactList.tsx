import type { RunArtifactSummary } from '@riskon/shared';
import { artifactDownloadHref } from '../../api';

interface Props {
  artifacts: RunArtifactSummary[];
  selectedId: string | null;
  onSelect: (artifact: RunArtifactSummary) => void;
}

/** What each published file is for, in the stakeholder's terms. */
const DESCRIPTIONS: Record<string, string> = {
  'report.md': 'The recommendation. Read this first.',
  'walkthrough.md': 'How the question became a search, in plain language.',
  'decision.csv': 'What to do, one row per choice.',
  'constraints.csv': 'Every rule, with what it allowed and what was used.',
  'summary.json': 'The headline figures and the assumption ledger.',
  'model.py': 'The formulation, for whoever audits the work.',
  'workbench.duckdb': 'The full dataset and result, for an auditor.',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactList({ artifacts, selectedId, onSelect }: Props) {
  return (
    <ul className="artifact-list">
      {artifacts.map((artifact) => (
        <li key={artifact.id} className="artifact-row">
          <button
            type="button"
            className={`artifact-open ${artifact.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(artifact)}
            disabled={!artifact.isPreviewable}
            title={
              artifact.isPreviewable
                ? `Open ${artifact.path}`
                : 'This file can only be downloaded'
            }
          >
            <span className="artifact-name">{artifact.path}</span>
            <span className="artifact-note">
              {DESCRIPTIONS[artifact.path] ?? formatSize(artifact.sizeBytes)}
            </span>
          </button>
          <a
            className="artifact-download"
            href={artifactDownloadHref(artifact.runId, artifact.id)}
            download={artifact.path}
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
