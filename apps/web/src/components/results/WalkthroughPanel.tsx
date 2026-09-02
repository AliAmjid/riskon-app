import { renderMarkdown, splitMarkdownSections } from '../../utils/markdown';
import type { Assumption, RunSummary } from '../../utils/runResult';

interface Props {
  markdown: string | null;
  summary: RunSummary | null;
  /** Used only when the agent did not publish a walkthrough. */
  reportMarkdown?: string | null;
}

const CONFIDENCE_COPY: Record<Assumption['confidence'], string> = {
  CONFIRMED: 'You confirmed this',
  DECLINED: 'You left this to us',
  GUESSED: 'We had to guess',
  UNMARKED: 'Our assumption',
};

/** Riskiest first: a guess is what the reader most needs to see. */
const CONFIDENCE_ORDER: Assumption['confidence'][] = [
  'GUESSED',
  'UNMARKED',
  'DECLINED',
  'CONFIRMED',
];

function assumptionsFromReport(report: string | null | undefined): string | null {
  if (!report) return null;
  const section = splitMarkdownSections(report).find((entry) =>
    /assumption/i.test(entry.heading ?? ''),
  );
  return section?.body.trim() ? section.body : null;
}

export function WalkthroughPanel({ markdown, summary, reportMarkdown }: Props) {
  const assumptions = [...(summary?.assumptions ?? [])].sort(
    (a, b) =>
      CONFIDENCE_ORDER.indexOf(a.confidence) -
      CONFIDENCE_ORDER.indexOf(b.confidence),
  );
  const fallback = !markdown ? assumptionsFromReport(reportMarkdown) : null;

  if (!markdown && !fallback && !assumptions.length) {
    return (
      <p className="model-copy">
        This run published no walkthrough — the short story of how the answer
        was reached. The Report tab is the recommendation itself.
      </p>
    );
  }

  return (
    <div className="stack readable">
      {markdown ? (
        <article
          className="markdown-body prose"
          // Sanitised in renderMarkdown; the agent's output is not trusted.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
        />
      ) : (
        <>
          <p className="model-copy">
            The agent did not write a separate walkthrough. What follows is
            every number that did not come from the data — the part a
            non-technical reader most needs in order to trust the answer.
          </p>
          {fallback ? (
            <article
              className="markdown-body prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(fallback) }}
            />
          ) : null}
        </>
      )}

      {assumptions.length > 0 && (
        <section className="ledger">
          <h3>Every number we did not get from the data</h3>
          <p className="model-copy">
            The answer rests on these. Anything marked as a guess is worth
            replacing with a real figure.
          </p>
          <ul className="ledger-list">
            {assumptions.map((entry) => (
              <li key={entry.text} className={`ledger-item ${entry.confidence.toLowerCase()}`}>
                <span className="ledger-tag">{CONFIDENCE_COPY[entry.confidence]}</span>
                <span className="ledger-text">{entry.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
