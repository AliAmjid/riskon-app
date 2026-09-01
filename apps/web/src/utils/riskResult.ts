import type {
  KeyResult,
  NormalizedRiskSenseResult,
  RecommendedDecision,
  RiskSenseResult,
} from '../types/risksense';

function text(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function pairs(value: unknown): RecommendedDecision[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (!item || typeof item !== 'object') {
        return { decision: `Decision ${index + 1}`, value: text(item) };
      }
      const record = item as Record<string, unknown>;
      return {
        decision: text(record.decision ?? record.label ?? record.name, `Decision ${index + 1}`),
        value: text(record.value ?? record.result ?? record.quantity ?? record.action),
      };
    });
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({
      decision: key,
      value: text(entryValue),
    }));
  }

  return [];
}

function keyResults(value: unknown, status: string): KeyResult[] {
  const result = pairs(value).map((item) => ({ label: item.decision, value: item.value }));
  if (!result.length) {
    result.push({ label: 'Solution status', value: text(status) });
  }
  while (result.length < 3) {
    result.push({ label: 'Result', value: '—' });
  }
  return result.slice(0, 3);
}

export function normalizeRiskSenseResult(data: RiskSenseResult): NormalizedRiskSenseResult {
  const status = text(data.solution_status ?? data.status, 'Unknown');
  const recommendation = text(
    data.main_recommendation ?? data.recommendation,
    'No recommendation was provided.',
  );

  return {
    title: text(data.report_title ?? data.title, 'Optimization report'),
    subtitle: text(
      data.report_subtitle ?? data.subtitle,
      'Generated from the optimization agent output.',
    ),
    status,
    recommendation,
    translation: text(
      data.how_we_translated_your_question ??
        data.model_translation ??
        data.mathematical_translation,
      'No mathematical translation was provided.',
    ),
    explanation: text(
      data.explanation ?? data.why_this_recommendation ?? data.execution_explanation,
      'No explanation was provided.',
    ),
    metrics: keyResults(data.key_results ?? data.metrics, status),
    decisions: pairs(data.recommended_decisions ?? data.decisions ?? data.actions),
  };
}

export const sampleRiskSenseResult: RiskSenseResult = {
  report_title: 'Risk Report — Diamonds',
  report_subtitle: 'Generated from the optimization agent output.',
  solution_status: 'Optimal',
  main_recommendation:
    'Purchase the proposed 60-diamond portfolio. It maximizes total carat mass within the available credit and display-space limits while maintaining the required diversification across cut categories.',
  key_results: [
    { label: 'Total mass', value: '42.64 carats' },
    { label: 'Solver status', value: 'Optimal' },
    { label: 'Total cost', value: '€99,975' },
  ],
  recommended_decisions: [
    { decision: 'Diamonds selected', value: '60' },
    { decision: 'Credit remaining', value: '€25' },
    { decision: 'Average mass', value: '0.711 carats' },
    { decision: 'Display space used', value: '1,934.54 mm²' },
    { decision: 'Display capacity used', value: '64.5%' },
  ],
  how_we_translated_your_question:
    'Each diamond became a binary decision: select it or leave it out. The objective maximized total carat mass. Budget, item-count, display-space and diversification requirements became mathematical constraints.',
  explanation:
    'The recommended mix uses nearly all available credit while leaving display capacity available. The solver found no feasible portfolio with a higher total mass under the supplied constraints.',
};
