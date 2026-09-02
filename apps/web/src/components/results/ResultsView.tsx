import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRunSummary, RunArtifactSummary } from '@riskon/shared';
import { artifactDownloadHref } from '../../api';
import { useArtifactTexts } from '../../hooks/useArtifactTexts';
import {
  formatNumber,
  readDecision,
  readLimits,
  readSummary,
  totalOf,
} from '../../utils/runResult';
import type { KeyResult } from '../../types/risksense';
import { DecisionPanel } from './DecisionPanel';
import { DocTabs, type DocTab } from './DocTabs';
import { FilesPanel } from './FilesPanel';
import { KpiGrid } from './KpiGrid';
import { ModelPanel } from './ModelPanel';
import { ReportPanel } from './ReportPanel';
import { RulesPanel } from './RulesPanel';
import { WalkthroughPanel } from './WalkthroughPanel';

interface Props {
  run: AgentRunSummary | null;
  artifacts: RunArtifactSummary[];
  /** The agent's closing sentence, used only when there is no report to show. */
  headline: string | null;
}

const REPORT = 'report.md';
const WALKTHROUGH = 'walkthrough.md';
const DECISION = 'decision.csv';
const CONSTRAINTS = 'constraints.csv';
const MODEL = 'model.py';
const SUMMARY = 'summary.json';

const READS = [REPORT, WALKTHROUGH, DECISION, CONSTRAINTS, MODEL, SUMMARY];

const STATUS_COPY: Record<AgentRunSummary['status'], string> = {
  pending: 'Starting',
  running: 'Working',
  awaiting_input: 'Waiting on you',
  finished: 'Done',
  error: 'Stopped early',
  cancelled: 'Cancelled',
};

/** What a solver status means to someone who will never use the word. */
const OUTCOME_COPY: Record<string, string> = {
  OPTIMAL: 'Proven best',
  FEASIBLE: 'Workable',
  INFEASIBLE: 'No valid answer',
  UNBOUNDED: 'Rules incomplete',
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
  const { texts, loading } = useArtifactTexts(run?.id ?? null, artifacts, READS);
  const [activeId, setActiveId] = useState('report');
  const workspaceRef = useRef<HTMLElement>(null);

  const decision = useMemo(
    () => (texts[DECISION] ? readDecision(texts[DECISION]) : null),
    [texts],
  );
  const limits = useMemo(
    () => (texts[CONSTRAINTS] ? readLimits(texts[CONSTRAINTS]) : null),
    [texts],
  );
  const summary = useMemo(
    () => (texts[SUMMARY] ? readSummary(texts[SUMMARY]) : null),
    [texts],
  );

  const tabs = useMemo<DocTab[]>(() => {
    const list: DocTab[] = [{ id: 'report', label: 'Report', group: 'The answer' }];
    // Always offer the walkthrough once there is a report: missing file still
    // gets a fallback assembled from the assumptions the report already named.
    if (texts[REPORT] || texts[WALKTHROUGH] || summary?.assumptions.length) {
      list.push({ id: 'walkthrough', label: 'How we got here', group: 'The answer' });
    }
    if (decision) {
      list.push({
        id: 'decision',
        label: 'Decision',
        badge: formatNumber(decision.chosen.length),
        group: 'The answer',
      });
    }
    if (limits) list.push({ id: 'rules', label: 'Rules', group: 'The answer' });
    if (texts[MODEL]) list.push({ id: 'model', label: 'Model', group: 'The working' });
    if (artifacts.length) {
      list.push({
        id: 'files',
        label: 'Files',
        badge: String(artifacts.length),
        group: 'The working',
      });
    }
    return list;
  }, [texts, decision, limits, summary, artifacts.length]);

  // A tab can disappear between runs; fall back rather than showing nothing.
  useEffect(() => {
    if (tabs.length && !tabs.some((tab) => tab.id === activeId)) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  useEffect(() => {
    workspaceRef.current?.scrollTo({ top: 0 });
  }, [activeId]);

  useEffect(() => {
    setActiveId('report');
  }, [run?.id]);

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

  const spend = decision ? totalOf(decision, decision.moneyColumn) : null;
  const outcome = summary?.status
    ? (OUTCOME_COPY[summary.status.toUpperCase()] ?? summary.status)
    : STATUS_COPY[run.status];

  const metrics: KeyResult[] = [];
  metrics.push({
    label: 'Outcome',
    value: outcome,
    note: summary?.status === 'OPTIMAL' ? 'nothing better fits your rules' : undefined,
  });
  if (decision) {
    // Newer runs publish only the decision, so "10 of 10 considered" would be
    // both redundant and wrong about what was weighed up.
    const narrowed = decision.all.length > decision.chosen.length;
    metrics.push({
      label: decision.weighted ? 'Positions taken' : 'Choices made',
      value: formatNumber(decision.chosen.length),
      note: narrowed
        ? `of ${formatNumber(decision.all.length)} considered`
        : undefined,
    });
  }
  if (spend != null) {
    metrics.push({
      label: 'Committed',
      value: formatNumber(spend),
      note: `total ${decision?.moneyColumn?.replace(/_/g, ' ')} across the answer`,
    });
  }
  if (limits) {
    metrics.push({
      label: 'Limits at their cap',
      value: `${limits.bindingCount} of ${limits.rules.length}`,
      note: limits.bindingCount
        ? "what's holding you back"
        : 'every rule had room left',
    });
  }
  if (metrics.length < 3) {
    metrics.push({ label: 'Files produced', value: String(run.artifactCount) });
    metrics.push({ label: 'Time taken', value: formatDuration(run) });
  }

  const activeFile = {
    report: REPORT,
    walkthrough: WALKTHROUGH,
    decision: DECISION,
    rules: CONSTRAINTS,
    model: MODEL,
  }[activeId];
  const downloadable = artifacts.find((artifact) => artifact.path === activeFile);

  return (
    <main ref={workspaceRef} className="results-workspace">
      <div className="results-header">
        <div>
          <h1>{run.title}</h1>
          <p>{run.businessQuestion}</p>
        </div>
        <p className="results-meta">
          <span className={`run-chip ${run.status}`}>{STATUS_COPY[run.status]}</span>
          <span>{formatDuration(run)}</span>
        </p>
      </div>

      <KpiGrid metrics={metrics} />

      {run.errorMessage && <p className="banner-error">{run.errorMessage}</p>}

      {artifacts.length === 0 ? (
        <section className="panel">
          <h2>Nothing published yet</h2>
          <p className="model-copy">
            {waiting
              ? 'Files appear here as soon as the agent publishes them.'
              : 'The agent published nothing. The activity feed on Chat shows how far it got.'}
          </p>
        </section>
      ) : (
        <div className="doc">
          <DocTabs tabs={tabs} activeId={activeId} onChange={setActiveId} />

          <div className="doc-main">
            <div className="doc-bar">
              <p className="doc-bar-title">
                {tabs.find((tab) => tab.id === activeId)?.label}
              </p>
              {downloadable && (
                <a
                  className="doc-download"
                  href={artifactDownloadHref(downloadable.runId, downloadable.id)}
                  download={downloadable.path}
                >
                  Download {downloadable.path}
                </a>
              )}
            </div>

            <div
              className="doc-body"
              role="tabpanel"
              id={`doc-panel-${activeId}`}
              aria-labelledby={`doc-tab-${activeId}`}
            >
              {loading && !Object.keys(texts).length ? (
                <p className="model-copy">Opening the report…</p>
              ) : (
                <>
                  {activeId === 'report' && (
                    <ReportPanel
                      markdown={texts[REPORT] ?? null}
                      fallback={headline}
                      decision={decision}
                      limits={limits}
                      summary={summary}
                    />
                  )}
                  {activeId === 'walkthrough' && (
                    <WalkthroughPanel
                      markdown={texts[WALKTHROUGH] ?? null}
                      summary={summary}
                      reportMarkdown={texts[REPORT] ?? null}
                    />
                  )}
                  {activeId === 'decision' && <DecisionPanel decision={decision} />}
                  {activeId === 'rules' && <RulesPanel limits={limits} />}
                  {activeId === 'model' && (
                    <ModelPanel source={texts[MODEL] ?? null} summary={summary} />
                  )}
                  {activeId === 'files' && <FilesPanel artifacts={artifacts} />}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
