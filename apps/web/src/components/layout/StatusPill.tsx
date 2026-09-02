export type PinStatus = 'ready' | 'busy' | 'offline' | 'error';

interface Props {
  status?: PinStatus;
  label?: string;
}

const labels: Record<PinStatus, string> = {
  ready: 'Completed',
  busy: 'Running',
  offline: 'Waiting',
  error: 'Failed',
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
        className={`status-dot ${status === 'ready' ? '' : status}`}
      />
    </div>
  );
}
