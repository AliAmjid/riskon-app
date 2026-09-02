import { useState } from 'react';
import type { SessionSummary } from '../../types/risksense';

interface Props {
  sessions: SessionSummary[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

function formatSessionTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  if (diffHours < 24 * 7) return `${Math.floor(diffHours / 24)}d ago`;
  return date.toLocaleDateString();
}

const STATUS_DOT: Record<SessionSummary['status'], string> = {
  pending: 'busy',
  running: 'busy',
  awaiting_input: 'offline',
  finished: '',
  error: 'error',
  cancelled: 'offline',
};

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: Props) {
  const [pinned, setPinned] = useState(false);

  return (
    <aside
      className={`sidebar ${pinned ? 'expanded' : ''}`}
      aria-label="All runs"
    >
      <button className="new-session" type="button" onClick={onNewSession}>
        <span aria-hidden="true">+</span>
        <span className="new-session-label">New session</span>
      </button>

      <div className="sidebar-label">All runs</div>

      <ul className="session-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              className={`session ${session.id === activeSessionId ? 'active' : ''}`}
              type="button"
              onClick={() => onSelectSession(session.id)}
              title={session.title}
            >
              <span
                className={`session-dot ${STATUS_DOT[session.status]}`}
                aria-hidden="true"
              />
              <span className="session-copy">
                <span className="session-title">{session.title}</span>
                <span className="session-time">
                  {formatSessionTime(session.updatedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        className="sidebar-pin"
        type="button"
        aria-pressed={pinned}
        onClick={() => setPinned((current) => !current)}
      >
        {pinned ? 'Keep closed' : 'Keep open'}
      </button>
    </aside>
  );
}
