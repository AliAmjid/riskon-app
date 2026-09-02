type AgentStatus = 'ready' | 'busy' | 'offline';

interface Props {
  status?: AgentStatus;
  label?: string;
}

const labels: Record<AgentStatus, string> = {
  ready: 'Agent ready',
  busy: 'Agent working',
  offline: 'Agent offline',
};

export function StatusPill({ status = 'ready', label }: Props) {
  const title = label ?? labels[status];
  return (
    <div
      className="status-pill"
      title={title}
      aria-label={title}
    >
      <span
        className={`status-dot ${status === 'busy' ? 'busy' : ''} ${status === 'offline' ? 'offline' : ''}`}
      />
    </div>
  );
}
