import type { ChangeEvent } from 'react';
import type { NormalizedRiskSenseResult, RiskSenseResult } from '../../types/risksense';
import { normalizeRiskSenseResult } from '../../utils/riskResult';
import { DecisionsTable } from './DecisionsTable';
import { KpiGrid } from './KpiGrid';

interface Props {
  result: RiskSenseResult;
  onLoadJson?: (result: RiskSenseResult) => void;
}

function RecommendationPanel({ result }: { result: NormalizedRiskSenseResult }) {
  return (
    <section className="panel">
      <p className="panel-kicker">Recommended action</p>
      <div className="status-banner">
        <span>Solution status</span>
        <strong>{result.status}</strong>
      </div>
      <p className="recommendation">{result.recommendation}</p>
    </section>
  );
}

function TranslationPanel({ translation }: { translation: string }) {
  return (
    <section className="panel">
      <p className="panel-kicker">How we translated your question</p>
      <p className="model-copy">{translation}</p>
    </section>
  );
}

function ExplanationPanel({ explanation }: { explanation: string }) {
  return (
    <section className="panel">
      <p className="panel-kicker">Why this recommendation</p>
      <p className="explanation-copy">{explanation}</p>
    </section>
  );
}

export function ResultsView({ result, onLoadJson }: Props) {
  const normalized = normalizeRiskSenseResult(result);

  function onJsonSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !onLoadJson) return;

    void file.text().then(
      (text) => {
        onLoadJson(JSON.parse(text) as RiskSenseResult);
      },
      () => {
        window.alert('Could not read this JSON file.');
      },
    );

    event.target.value = '';
  }

  return (
    <main className="results-workspace">
      <div className="results-header">
        <div>
          <h1>{normalized.title}</h1>
          <p>{normalized.subtitle}</p>
        </div>
        <label className="json-button" htmlFor="json-file">
          Load result JSON
        </label>
        <input
          className="sr-only"
          id="json-file"
          type="file"
          accept=".json,application/json"
          onChange={onJsonSelected}
        />
      </div>

      <KpiGrid metrics={normalized.metrics} />

      <div className="results-grid">
        <div className="results-column">
          <RecommendationPanel result={normalized} />
          <DecisionsTable
            decisions={normalized.decisions}
            fallbackRecommendation={normalized.recommendation}
          />
        </div>
        <div className="results-column">
          <TranslationPanel translation={normalized.translation} />
          <ExplanationPanel explanation={normalized.explanation} />
        </div>
      </div>
    </main>
  );
}
