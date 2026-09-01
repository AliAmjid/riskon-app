export type WorkspaceView = 'input' | 'results';

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DataPreview {
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: string[][];
  fileName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
  processing?: boolean;
}

export interface KeyResult {
  label: string;
  value: string;
}

export interface RecommendedDecision {
  decision: string;
  value: string;
}

export interface RiskSenseResult {
  report_title?: string;
  report_subtitle?: string;
  title?: string;
  subtitle?: string;
  solution_status?: string;
  status?: string;
  main_recommendation?: string;
  recommendation?: string;
  key_results?: KeyResult[];
  metrics?: KeyResult[];
  recommended_decisions?: RecommendedDecision[];
  decisions?: RecommendedDecision[];
  actions?: RecommendedDecision[];
  how_we_translated_your_question?: string;
  model_translation?: string;
  mathematical_translation?: string;
  explanation?: string;
  why_this_recommendation?: string;
  execution_explanation?: string;
}

export interface NormalizedRiskSenseResult {
  title: string;
  subtitle: string;
  status: string;
  recommendation: string;
  translation: string;
  explanation: string;
  metrics: KeyResult[];
  decisions: RecommendedDecision[];
}
