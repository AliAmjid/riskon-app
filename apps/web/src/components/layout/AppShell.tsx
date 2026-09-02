import type { ReactNode } from 'react';
import type { SessionSummary, WorkspaceView } from '../../types/risksense';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { PinStatus } from './StatusPill';

interface Props {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  resultsReady: boolean;
  sessions: SessionSummary[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  agentStatus?: PinStatus;
  agentStatusLabel?: string;
  chatView: ReactNode;
  resultsView: ReactNode;
}

export function AppShell({
  activeView,
  onViewChange,
  resultsReady,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  agentStatus,
  agentStatusLabel,
  chatView,
  resultsView,
}: Props) {
  return (
    <div className="app">
      <TopBar
        activeView={activeView}
        onViewChange={onViewChange}
        resultsReady={resultsReady}
        agentStatus={agentStatus}
        agentStatusLabel={agentStatusLabel}
      />

      <section
        className={`view ${activeView === 'chat' ? 'active' : ''}`}
        id="chat-view"
        aria-hidden={activeView !== 'chat'}
      >
        <div className="chat-shell">
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
          />
          {chatView}
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
