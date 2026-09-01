import type { ChatMessage, DataPreview } from '../../types/risksense';
import { ChatPanel } from './ChatPanel';
import { DataPreviewCard } from './DataPreviewCard';
import { UploadCard } from './UploadCard';

interface Props {
  title: string;
  preview: DataPreview;
  messages: ChatMessage[];
  onPreviewChange: (preview: DataPreview) => void;
  onSendMessage: (question: string) => void;
  chatDisabled?: boolean;
}

export function InputView({
  title,
  preview,
  messages,
  onPreviewChange,
  onSendMessage,
  chatDisabled,
}: Props) {
  function onUploadError(message: string) {
    window.alert(message);
  }

  return (
    <main className="workspace">
      <h1 className="page-title">{title}</h1>

      <div className="data-row">
        <UploadCard
          fileName={preview.fileName ?? 'No file selected'}
          onPreview={onPreviewChange}
          onError={onUploadError}
        />
        <DataPreviewCard preview={preview} />
      </div>

      <ChatPanel messages={messages} onSend={onSendMessage} disabled={chatDisabled} />
    </main>
  );
}
