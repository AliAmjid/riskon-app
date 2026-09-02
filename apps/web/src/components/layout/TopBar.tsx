import type { WorkspaceView } from '../../types/risksense';
import { StatusPill, type PinStatus } from './StatusPill';

interface Props {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  resultsReady: boolean;
  agentStatus?: PinStatus;
  agentStatusLabel?: string;
}

export function TopBar({
  activeView,
  onViewChange,
  resultsReady,
  agentStatus = 'ready',
  agentStatusLabel,
}: Props) {
  return (
    <header className="topbar">
      <div className="brand" aria-label="RiskSense AI">
        RiskSense <span>AI</span>
      </div>

      <nav className="topnav" aria-label="Workspace views">
        <button
          className={`nav-tab ${activeView === 'chat' ? 'active' : ''}`}
          type="button"
          onClick={() => onViewChange('chat')}
        >
          Chat
        </button>
        <button
          className={`nav-tab ${activeView === 'results' ? 'active' : ''}`}
          type="button"
          onClick={() => onViewChange('results')}
          disabled={!resultsReady}
          title={
            resultsReady
              ? undefined
              : 'Results appear when the run has finished'
          }
        >
          Results
        </button>
      </nav>

      <div className="status-area">
        <StatusPill status={agentStatus} label={agentStatusLabel} />
      </div>
    </header>
  );
}
