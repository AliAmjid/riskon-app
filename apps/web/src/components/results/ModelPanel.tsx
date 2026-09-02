import type { RunSummary } from '../../utils/runResult';
import { formatNumber } from '../../utils/runResult';

interface Props {
  source: string | null;
  summary: RunSummary | null;
}

export function ModelPanel({ source, summary }: Props) {
  if (!source) {
    return (
      <p className="model-copy">
        This run published no formulation, so there is nothing to audit here.
      </p>
    );
  }

  const lines = source.replace(/\n$/, '').split('\n');

  const facts = [
    summary?.solver ? { label: 'Solved with', value: summary.solver } : null,
    summary?.status ? { label: 'Result', value: summary.status } : null,
    summary?.runtimeSeconds != null
      ? {
          label: 'Solve time',
          value:
            summary.runtimeSeconds < 1
              ? `${Math.round(summary.runtimeSeconds * 1000)} ms`
              : `${formatNumber(summary.runtimeSeconds)} s`,
        }
      : null,
    summary?.candidateRows != null && summary?.sourceRows != null
      ? {
          label: 'Rows modelled',
          value: `${formatNumber(summary.candidateRows)} of ${formatNumber(summary.sourceRows)}`,
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  return (
    <div className="stack">
      <p className="model-copy">
        This is the code that produced the recommendation, published so the
        arithmetic can be checked rather than taken on trust. Nobody needs to
        read it to act on the answer.
      </p>

      {facts.length > 0 && (
        <ul className="fact-row">
          {facts.map((fact) => (
            <li key={fact.label}>
              <span className="fact-label">{fact.label}</span>
              <span className="fact-value">{fact.value}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="code-block">
        <div className="code-gutter" aria-hidden="true">
          {lines.map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <pre className="code-body">
          <code>{lines.join('\n')}</code>
        </pre>
      </div>
    </div>
  );
}
