import type { WorkspaceView } from '../../types/risksense';
import { StatusPill } from './StatusPill';

interface Props {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  agentStatus?: 'ready' | 'busy' | 'offline';
  agentStatusLabel?: string;
}

export function TopBar({
  activeView,
  onViewChange,
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
          className={`nav-tab ${activeView === 'input' ? 'active' : ''}`}
          type="button"
          onClick={() => onViewChange('input')}
        >
          Input
        </button>
        <button
          className={`nav-tab ${activeView === 'results' ? 'active' : ''}`}
          type="button"
          onClick={() => onViewChange('results')}
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
