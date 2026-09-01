import type { ReactNode } from 'react';
import type { SessionSummary, WorkspaceView } from '../../types/risksense';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface Props {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  sessions: SessionSummary[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  agentStatus?: 'ready' | 'busy' | 'offline';
  inputView: ReactNode;
  resultsView: ReactNode;
}

export function AppShell({
  activeView,
  onViewChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  agentStatus,
  inputView,
  resultsView,
}: Props) {
  return (
    <div className="app">
      <TopBar activeView={activeView} onViewChange={onViewChange} agentStatus={agentStatus} />

      <section
        className={`view ${activeView === 'input' ? 'active' : ''}`}
        id="input-view"
        aria-hidden={activeView !== 'input'}
      >
        <div className="input-shell">
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
          />
          {inputView}
        </div>
      </section>

      <section
        className={`view ${activeView === 'results' ? 'active' : ''}`}
        id="results-view"
        aria-hidden={activeView !== 'results'}
      >
        {resultsView}
      </section>
    </div>
  );
}
