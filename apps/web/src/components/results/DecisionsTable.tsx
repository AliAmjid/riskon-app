import type { RecommendedDecision } from '../../types/risksense';

interface Props {
  decisions: RecommendedDecision[];
  fallbackRecommendation: string;
}

export function DecisionsTable({ decisions, fallbackRecommendation }: Props) {
  const rows = decisions.length
    ? decisions
    : [{ decision: 'Recommended action', value: fallbackRecommendation }];

  return (
    <section className="panel" aria-labelledby="decision-heading">
      <h2 id="decision-heading">Recommended decisions</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.decision}>
                <td>{row.decision}</td>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
