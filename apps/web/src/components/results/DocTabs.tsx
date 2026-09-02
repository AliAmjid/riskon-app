import { Fragment } from 'react';

export interface DocTab {
  id: string;
  label: string;
  /** Shown as a small count beside the label, e.g. the number of choices. */
  badge?: string;
  /** Consecutive tabs that share a group sit under one heading. */
  group?: string;
}

interface Props {
  tabs: DocTab[];
  activeId: string;
  onChange: (id: string) => void;
}

/**
 * Sections of one result, as a document outline rather than a second top nav.
 *
 * Chat | Results already owns the underlined tab pattern. Putting the same
 * pattern underneath it reads as one broken navigation; a labelled list on
 * the left of the document reads as "parts of this file".
 */
export function DocTabs({ tabs, activeId, onChange }: Props) {
  return (
    <nav className="doc-nav" aria-label="Sections of this result">
      <div className="doc-tabs" role="tablist">
        {tabs.map((tab, index) => {
          const prev = tabs[index - 1];
          const showGroup = Boolean(tab.group) && tab.group !== prev?.group;
          const active = tab.id === activeId;
          return (
            <Fragment key={tab.id}>
              {showGroup ? (
                <p className="doc-tab-group" aria-hidden="true">
                  {tab.group}
                </p>
              ) : null}
              <button
                type="button"
                role="tab"
                id={`doc-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`doc-panel-${tab.id}`}
                className={`doc-tab ${active ? 'active' : ''}`}
                onClick={() => onChange(tab.id)}
              >
                {tab.label}
                {tab.badge ? <span className="doc-tab-badge">{tab.badge}</span> : null}
              </button>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
