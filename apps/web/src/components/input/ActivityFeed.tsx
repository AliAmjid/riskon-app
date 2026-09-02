import { useEffect, useRef } from 'react';
import type { ActivityEntry } from '../../utils/runEvents';

interface Props {
  entries: ActivityEntry[];
  /** True while the agent is working, so the feed shows it is not stalled. */
  working: boolean;
  emptyMessage: string;
}

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

export function ActivityFeed({ entries, working, emptyMessage }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [entries, working]);

  return (
    <div className="messages" ref={scrollRef} aria-live="polite">
      {entries.length === 0 && !working && (
        <p className="feed-empty">{emptyMessage}</p>
      )}

      {entries.map((entry) => {
        const isUser = entry.actor === 'user';
        const rowClass = isUser ? 'user' : 'agent';
        const mark = isUser ? 'You' : 'AI';

        return entry.kind === 'do' ? (
          <div key={entry.id} className="activity-step">
            <span className="activity-tick" aria-hidden="true" />
            <span>{entry.text}</span>
          </div>
        ) : (
          <div
            key={entry.id}
            className={`message-row ${rowClass} ${entry.kind === 'note' ? 'note' : ''}`}
          >
            <div className="agent-mark">{mark}</div>
            <div>
              <div className="bubble">{entry.text}</div>
              <div className="message-time">{formatTime(entry.createdAt)}</div>
            </div>
          </div>
        );
      })}

      {working && (
        <div className="message-row agent">
          <div className="agent-mark">AI</div>
          <div>
            <div className="bubble">
              <span className="processing">
                <span className="spinner" />
                <span>Working…</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
