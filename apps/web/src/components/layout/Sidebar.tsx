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
  return 'Last week';
}

export function Sidebar({ sessions, activeSessionId, onSelectSession, onNewSession }: Props) {
  return (
    <aside className="sidebar" aria-label="Recent sessions">
      <button className="new-session" type="button" onClick={onNewSession}>
        + New Session
      </button>

      <div className="sidebar-label">Recent sessions</div>

      <ul className="session-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              className={`session ${session.id === activeSessionId ? 'active' : ''}`}
              type="button"
              onClick={() => onSelectSession(session.id)}
            >
              <span className="session-title">{session.title}</span>
              <span className="session-time">{formatSessionTime(session.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <span>Help &amp; Documentation</span>
        <span>Settings</span>
      </div>
    </aside>
  );
}
