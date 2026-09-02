import { useState } from 'react';
import {
  formatLimitValue,
  limitVerdict,
  type Limits,
} from '../../utils/runResult';
import { LimitBars } from './Charts';

interface Props {
  limits: Limits | null;
}

export function RulesPanel({ limits }: Props) {
  // The expressions are the auditor's view of a rule, and they are written in
  // solver notation. Off by default so the sentences are what a stakeholder
  // reads, but one click away for whoever is checking the translation.
  const [showMaths, setShowMaths] = useState(false);

  if (!limits) {
    return (
      <p className="model-copy">
        This run published no record of the rules it worked under.
      </p>
    );
  }

  const binding = limits.rules.filter((rule) => rule.binding);

  return (
    <div className="stack">
      {limits.violated.length > 0 && (
        <p className="banner-error">
          {limits.violated.length === 1 ? 'One rule was broken' : `${limits.violated.length} rules were broken`}
          : {limits.violated.map((rule) => rule.rule).join('; ')}. Treat the
          recommendation as unsafe until this is explained.
        </p>
      )}

      <p className="model-copy">
        {binding.length === 0 ? (
          <>
            Every rule had room left over, which means none of them is what
            limited the answer. Something else — the data itself — is the
            constraint.
          </>
        ) : (
          <>
            {binding.length === 1 ? 'One rule is' : `${binding.length} rules are`}{' '}
            at their limit. Those are the ones holding the answer back: relaxing
            one of them is the only way to a better outcome, and relaxing
            anything else changes nothing.
          </>
        )}
      </p>

      <LimitBars limits={limits.rules} />

      <section>
        <div className="chart-card-head">
          <h3>Every rule, in full</h3>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowMaths((current) => !current)}
          >
            {showMaths ? 'Hide the maths' : 'Show the maths'}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table rules-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th className="numeric">Allowed</th>
                <th className="numeric">Used</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {limits.rules.map((limit) => (
                <tr key={limit.key}>
                  <td className="rule-cell">
                    {limit.rule}
                    {showMaths && limit.expression && (
                      <span className="rule-expression">{limit.expression}</span>
                    )}
                  </td>
                  <td className="numeric">
                    {limit.sense === '>=' ? '≥ ' : '≤ '}
                    {formatLimitValue(limit, limit.bound)}
                  </td>
                  <td className="numeric">{formatLimitValue(limit, limit.achieved)}</td>
                  <td>
                    <span
                      className={`verdict-tag ${
                        limit.satisfied === false
                          ? 'broken'
                          : limit.binding
                            ? 'binding'
                            : 'slack'
                      }`}
                    >
                      {limitVerdict(limit)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
