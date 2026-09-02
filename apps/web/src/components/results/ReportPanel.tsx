import { Fragment } from 'react';
import { renderMarkdown, splitMarkdownSections } from '../../utils/markdown';
import {
  composition,
  formatNumber,
  totalOf,
  type Decision,
  type Limits,
  type RunSummary,
} from '../../utils/runResult';
import { CompositionBar, LimitBars } from './Charts';

interface Props {
  markdown: string | null;
  /** The agent's closing sentence, shown only when there is no report file. */
  fallback: string | null;
  decision: Decision | null;
  limits: Limits | null;
  summary: RunSummary | null;
}

/**
 * The recommendation document: the agent's report.md, rendered as written,
 * with charts drawn from the published CSVs slipped in after the opening.
 *
 * The file stays markdown on purpose. An HTML report the agent wrote by hand
 * would be a second source of truth that can drift from the decision; these
 * figures cannot, because they are the same numbers as the Decision and Rules
 * tabs.
 */
export function ReportPanel({
  markdown,
  fallback,
  decision,
  limits,
  summary,
}: Props) {
  if (!markdown) {
    return (
      <>
        {fallback ? <p className="recommendation">{fallback}</p> : null}
        <p className="model-copy">
          This run published no report, so the summary above is all the agent
          left. The Files tab lists everything it did produce.
        </p>
      </>
    );
  }

  const sections = splitMarkdownSections(markdown);
  const insertAt = figureIndex(sections);
  const figures = (
    <ReportFigures decision={decision} limits={limits} summary={summary} />
  );

  return (
    <article className="report-doc">
      {sections.map((section, index) => {
        const lede = /recommend/i.test(section.heading ?? '');
        return (
          <Fragment key={`${section.heading ?? 'title'}-${index}`}>
            <div
              className={`markdown-body${lede ? ' report-lede' : ''}`}
              // Sanitised in renderMarkdown; the agent's output is not trusted.
              dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) }}
            />
            {index === insertAt ? figures : null}
          </Fragment>
        );
      })}
    </article>
  );
}

/** Generic column names add nothing as a chart title. */
function groupingLabel(column: string | null | undefined): string {
  if (!column) return '';
  const generic = ['category', 'group', 'class', 'type', 'segment'];
  if (generic.includes(column.toLowerCase())) return '';
  return ` by ${column.replace(/_/g, ' ')}`;
}

/** After the opening claim, before the long tables. */
function figureIndex(
  sections: { heading: string | null }[],
): number {
  const by = (pattern: RegExp) =>
    sections.findIndex((section) => pattern.test(section.heading ?? ''));
  const achieves = by(/what this achieves/i);
  if (achieves >= 0) return achieves;
  const recommend = by(/recommend/i);
  if (recommend >= 0) return recommend;
  return 0;
}

function ReportFigures({
  decision,
  limits,
  summary,
}: {
  decision: Decision | null;
  limits: Limits | null;
  summary: RunSummary | null;
}) {
  const split = decision ? composition(decision, null).slice(0, 8) : [];
  const pressure = limits
    ? [...limits.rules]
        .sort((a, b) => Number(b.binding) - Number(a.binding))
        .slice(0, 5)
    : [];
  const spend = decision ? totalOf(decision, decision.moneyColumn) : null;

  if (!split.length && !pressure.length && summary?.objective == null) {
    return null;
  }

  return (
    <figure className="report-figures">
      {summary?.objective != null && summary.objectiveLabel && (
        <p className="report-figures-kicker">
          {formatNumber(summary.objective)} {summary.objectiveLabel}
          {spend != null ? ` · ${formatNumber(spend)} committed` : ''}
        </p>
      )}

      <div className="chart-pair">
        {split.length > 0 && (
          <section className="chart-card">
            <div className="chart-card-head">
              <h3>
                How it splits
                {groupingLabel(decision?.categoryColumn)}
              </h3>
            </div>
            <CompositionBar
              slices={split}
              unit={decision?.moneyColumn ? 'of spend' : undefined}
            />
          </section>
        )}

        {pressure.length > 0 && (
          <section className="chart-card">
            <div className="chart-card-head">
              <h3>What is holding you back</h3>
            </div>
            <LimitBars limits={pressure} />
          </section>
        )}
      </div>
    </figure>
  );
}
