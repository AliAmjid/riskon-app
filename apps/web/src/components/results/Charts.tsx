import {
  formatLimitValue,
  formatNumber,
  limitVerdict,
  type Limit,
  type Slice,
} from '../../utils/runResult';

/**
 * Charts here are drawn with CSS and inline SVG rather than a charting
 * library. The shapes needed are three — a utilisation bar, a stacked share
 * bar and a ranked bar list — and hand-drawing them keeps the palette on
 * brand and the bundle free of a dependency that would only earn its place
 * if the page grew real plotting.
 */

const CATEGORY_CLASSES = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
];

export function categoryClass(index: number): string {
  return CATEGORY_CLASSES[index % CATEGORY_CLASSES.length];
}

// ---------------------------------------------------------------------------
// Limits: how much of each rule's allowance the answer used
// ---------------------------------------------------------------------------

export function LimitBars({ limits }: { limits: Limit[] }) {
  if (!limits.length) return null;

  return (
    <ul className="limit-bars">
      {limits.map((limit) => {
        const bound = Math.abs(limit.bound ?? 0);
        const achieved = Math.abs(limit.achieved ?? 0);
        const floor = limit.sense === '>=';

        // A ceiling is framed by its own allowance, so a full bar means "at
        // the limit". A floor needs headroom drawn past it, or clearing a
        // 25 mpg minimum by 0.18 fills the bar and reads as if it were stuck.
        const scale = floor
          ? Math.max(bound, achieved) * 1.3
          : Math.max(bound, achieved);

        const fill = scale > 0 ? Math.min(1, achieved / scale) : 0;
        const marker = scale > 0 ? Math.min(1, bound / scale) : 0;
        const tone =
          limit.satisfied === false ? 'broken' : limit.binding ? 'binding' : 'slack';

        return (
          <li className="limit-bar" key={limit.key}>
            <div className="limit-bar-head">
              <span className="limit-bar-rule">{limit.rule}</span>
              <span className={`limit-bar-verdict ${tone}`}>{limitVerdict(limit)}</span>
            </div>

            <div className="limit-bar-track" aria-hidden="true">
              <div
                className={`limit-bar-fill ${tone}`}
                style={{ width: `${fill * 100}%` }}
              />
              {limit.bound != null && marker > 0 && marker < 1 && (
                <div className="limit-bar-marker" style={{ left: `${marker * 100}%` }} />
              )}
            </div>

            <p className="limit-bar-foot">
              {limit.sense === '>=' ? 'At least' : 'Up to'}{' '}
              <strong>{formatLimitValue(limit, limit.bound)}</strong>
              {' · used '}
              <strong>{formatLimitValue(limit, limit.achieved)}</strong>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Composition: how the answer splits across one grouping
// ---------------------------------------------------------------------------

interface CompositionProps {
  slices: Slice[];
  /** Rendered next to each share, e.g. "of spend". */
  unit?: string;
}

export function CompositionBar({ slices, unit }: CompositionProps) {
  if (!slices.length) return null;

  return (
    <div className="composition">
      <div className="composition-track" role="img" aria-label={
        slices.map((slice) => `${slice.label} ${Math.round(slice.share * 100)}%`).join(', ')
      }>
        {slices.map((slice, index) => (
          <div
            key={slice.label}
            className={`composition-slice ${categoryClass(index)}`}
            style={{ flexGrow: slice.share }}
            title={`${slice.label}: ${formatNumber(slice.value)}`}
          />
        ))}
      </div>

      <ul className="composition-legend">
        {slices.map((slice, index) => (
          <li key={slice.label}>
            <span className={`swatch ${categoryClass(index)}`} aria-hidden="true" />
            <span className="composition-label">{slice.label}</span>
            <span className="composition-share">
              {formatNumber(slice.share * 100, 1)}%
              {unit ? <span className="composition-unit"> {unit}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contributions: the individual choices that account for the most
// ---------------------------------------------------------------------------

interface ContributionProps {
  slices: Slice[];
  format?: (value: number) => string;
}

export function ContributionBars({ slices, format = formatNumber }: ContributionProps) {
  if (!slices.length) return null;
  const peak = Math.max(...slices.map((slice) => slice.value));

  return (
    <ul className="ranked-bars">
      {slices.map((slice) => (
        <li key={slice.label}>
          <span className="ranked-label" title={slice.label}>
            {slice.label}
          </span>
          <span className="ranked-track" aria-hidden="true">
            <span
              className="ranked-fill"
              style={{ width: `${peak > 0 ? (slice.value / peak) * 100 : 0}%` }}
            />
          </span>
          <span className="ranked-value">{format(slice.value)}</span>
        </li>
      ))}
    </ul>
  );
}
