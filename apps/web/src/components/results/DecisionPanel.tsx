import { useMemo, useState } from 'react';
import {
  composition,
  contributions,
  formatNumber,
  totalOf,
  type Decision,
} from '../../utils/runResult';
import { CompositionBar, ContributionBars } from './Charts';
import { DataTable } from './DataTable';

interface Props {
  decision: Decision | null;
}

export function DecisionPanel({ decision }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [groupBy, setGroupBy] = useState<string | null>(null);

  const groupings = useMemo(() => {
    if (!decision) return [];
    return decision.headers.filter((header) => {
      if (header.toLowerCase() === 'row_id') return false;
      if (header === decision.selectionColumn) return false;
      // Grouping by the label gives one group per choice, which is the table.
      if (header === decision.labelColumn) return false;
      if (decision.numericColumns.includes(header)) return false;
      const distinct = new Set(decision.chosen.map((row) => row[header])).size;
      return distinct >= 2 && distinct <= 12;
    });
  }, [decision]);

  if (!decision) {
    return (
      <p className="model-copy">
        This run published no decision file, so there is nothing to list here.
      </p>
    );
  }

  const active = groupBy ?? decision.categoryColumn ?? groupings[0] ?? null;
  const split = composition(decision, active).slice(0, 10);
  const top = contributions(decision, 10);

  const spend = totalOf(decision, decision.moneyColumn);
  const value = totalOf(decision, decision.valueColumn);
  const units = decision.weighted ? totalOf(decision, decision.quantityColumn) : null;

  // decision.csv from older runs carries the whole candidate set, so the
  // count that matters is the chosen one.
  const considered = decision.all.length;
  const rows = showAll ? decision.all : decision.chosen;

  // row_id is plumbing; the reader wants the columns that describe a choice.
  const columns = decision.headers.filter(
    (header) => header.toLowerCase() !== 'row_id' && header !== decision.selectionColumn,
  );

  return (
    <div className="stack">
      <ul className="mini-stats">
        <li>
          <span className="mini-label">
            {decision.weighted ? 'Positions taken' : 'Choices made'}
          </span>
          <span className="mini-value">{formatNumber(decision.chosen.length)}</span>
          {considered > decision.chosen.length ? (
            <span className="mini-note">out of {formatNumber(considered)} considered</span>
          ) : null}
        </li>
        {units != null && (
          <li>
            <span className="mini-label">Total units</span>
            <span className="mini-value">{formatNumber(units)}</span>
            <span className="mini-note">
              summed over the {decision.quantityColumn?.replace(/_/g, ' ')} column
            </span>
          </li>
        )}
        {spend != null && (
          <li>
            <span className="mini-label">Committed</span>
            <span className="mini-value">{formatNumber(spend)}</span>
            <span className="mini-note">
              total {decision.moneyColumn?.replace(/_/g, ' ')} across the answer
            </span>
          </li>
        )}
        {value != null && (
          <li>
            <span className="mini-label">
              {decision.valueColumn?.replace(/_/g, ' ') ?? 'Value'} delivered
            </span>
            <span className="mini-value">{formatNumber(value)}</span>
            <span className="mini-note">what the answer buys you</span>
          </li>
        )}
      </ul>

      <div className="chart-pair">
        {split.length > 0 && active && (
          <section className="chart-card">
            <div className="chart-card-head">
              <h3>Where it goes</h3>
              {groupings.length > 1 && (
                <label className="chart-select">
                  <span className="sr-only">Group the answer by</span>
                  <select
                    value={active}
                    onChange={(event) => setGroupBy(event.target.value)}
                  >
                    {groupings.map((option) => (
                      <option key={option} value={option}>
                        by {option.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <CompositionBar
              slices={split}
              unit={decision.moneyColumn ? 'of spend' : undefined}
            />
          </section>
        )}

        {top.length > 0 && (
          <section className="chart-card">
            <div className="chart-card-head">
              <h3>Biggest single commitments</h3>
            </div>
            <ContributionBars slices={top} />
          </section>
        )}
      </div>

      <section>
        <div className="chart-card-head">
          <h3>{showAll ? 'Everything considered' : 'What to do'}</h3>
          {considered > decision.chosen.length && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? 'Show only the answer'
                : `Show all ${formatNumber(considered)} considered`}
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          numericColumns={decision.numericColumns}
        />
      </section>
    </div>
  );
}
