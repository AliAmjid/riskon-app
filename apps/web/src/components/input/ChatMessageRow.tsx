import type { ChatMessage } from '../../types/risksense';

interface Props {
  message: ChatMessage;
}

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoDate),
  );
}

export function ChatMessageRow({ message }: Props) {
  return (
    <div className={`message-row ${message.role}`}>
      {message.role === 'agent' && <div className="agent-mark">AI</div>}
      <div>
        <div className="bubble">
          {message.processing ? (
            <span className="processing">
              <span className="spinner" />
              <span>{message.content}</span>
            </span>
          ) : (
            message.content
          )}
        </div>
        <div className="message-time">{formatTime(message.createdAt)}</div>
      </div>
    </div>
  );
}
