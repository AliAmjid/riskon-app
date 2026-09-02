import type { KeyResult } from '../../types/risksense';

interface Props {
  metrics: KeyResult[];
}

export function KpiGrid({ metrics }: Props) {
  return (
    <section className="kpi-grid" aria-label="Key results">
      {metrics.map((metric) => (
        <article key={metric.label} className="kpi">
          <div className="kpi-label">{metric.label}</div>
          <div className="kpi-value">{metric.value}</div>
          {metric.note ? <div className="kpi-note">{metric.note}</div> : null}
        </article>
      ))}
    </section>
  );
}
