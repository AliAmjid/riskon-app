import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type DragEvent } from 'react';
import type { AnswerQuestionsRequest, RunQuestionRequest } from '@riskon/shared';
import type { DataAttachment } from '../../types/risksense';
import type { ActivityEntry } from '../../utils/runEvents';
import { ActivityFeed } from './ActivityFeed';
import { DataPreviewModal } from './DataPreviewModal';
import { DatasetChip } from './DatasetChip';
import { QuestionCard } from './QuestionCard';
import { UploadCard } from './UploadCard';

interface Props {
  attachments: DataAttachment[];
  activity: ActivityEntry[];
  pendingQuestion: RunQuestionRequest | null;
  working: boolean;
  uploading: boolean;
  /** True once a run has started — swapping the file would be ignored. */
  runLocked: boolean;
  /** True when sending should continue this session rather than start a new one. */
  continueMode?: boolean;
  error: string | null;
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onAskQuestion: (question: string) => void;
  onAnswerQuestion: (body: AnswerQuestionsRequest) => Promise<void>;
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function InputView({
  attachments = [],
  activity,
  pendingQuestion,
  working,
  uploading,
  runLocked,
  continueMode = false,
  error,
  onFilesSelected,
  onRemoveAttachment,
  onAskQuestion,
  onAnswerQuestion,
}: Props) {
  const [input, setInput] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (working) setInput('');
  }, [working]);

  const composerDisabled = working || pendingQuestion !== null;
  const acceptDrop = !runLocked && !uploading;
  const preview = attachments.find((item) => item.id === previewId) ?? null;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    const minLength = continueMode ? 3 : 10;
    if (question.length < minLength || composerDisabled) return;
    onAskQuestion(question);
    setInput('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (acceptDrop) setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (acceptDrop) setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!acceptDrop) return;
    const files = [...event.dataTransfer.files];
    if (files.length > 0) onFilesSelected(files);
  }

  return (
    <main className="workspace">
      {error && <p className="banner-error">{error}</p>}

      <section
        className={[
          'chat-panel',
          pendingQuestion ? 'awaiting' : '',
          attachments.length > 0 ? 'has-data' : '',
          dragging ? 'file-hover' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Run activity"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {(attachments.length > 0 || !runLocked) && (
          <div className="dataset-rail">
            {attachments.map((attachment) => (
              <DatasetChip
                key={attachment.id}
                attachment={attachment}
                onOpen={() => setPreviewId(attachment.id)}
                onRemove={
                  !runLocked && onRemoveAttachment
                    ? () => onRemoveAttachment(attachment.id)
                    : undefined
                }
              />
            ))}
            {!runLocked && attachments.length > 0 && (
              <label className="dataset-add" htmlFor="csv-file" title="Add another file">
                <span aria-hidden="true">+</span>
                <span>Add</span>
              </label>
            )}
          </div>
        )}

        <ActivityFeed
          entries={activity}
          working={working}
          emptySlot={
            attachments.length > 0 ? (
              <p className="feed-empty">
                Describe the decision you need to make and the agent will get to
                work.
              </p>
            ) : (
              <div className="message-row agent">
                <div className="agent-mark">AI</div>
                <div>
                  <div className="bubble">
                    {uploading ? (
                      <span className="processing">
                        <span className="spinner" />
                        <span>Uploading…</span>
                      </span>
                    ) : (
                      <>
                        Upload one or more CSV, TSV, JSON or Parquet files to get
                        started.
                        <label className="chat-upload-link" htmlFor="csv-file">
                          Choose files
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          }
        />

        {pendingQuestion && (
          <QuestionCard round={pendingQuestion} onSubmit={onAnswerQuestion} />
        )}

        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="chat-input">
            Business question
          </label>
          <textarea
            ref={composerRef}
            id="chat-input"
            rows={2}
            placeholder={
              pendingQuestion
                ? 'Answer the question above first…'
                : continueMode
                  ? 'Ask a follow-up, or change a number…'
                  : 'Describe the business decision you want to optimise…'
            }
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={composerDisabled}
          />
          <button
            className="send-button"
            type="submit"
            aria-label={continueMode ? 'Send follow-up' : 'Start a run'}
            disabled={
              composerDisabled || input.trim().length < (continueMode ? 3 : 10)
            }
          >
            <SendIcon />
          </button>
          <p className="composer-hint">
            {composerDisabled
              ? 'The agent is working on the current question.'
              : 'Press Enter to send · Shift + Enter for a new line'}
          </p>
        </form>

        <UploadCard
          uploading={uploading}
          disabled={runLocked}
          onFilesSelected={onFilesSelected}
        />
      </section>

      {preview && (
        <DataPreviewModal
          attachment={preview}
          onClose={() => setPreviewId(null)}
        />
      )}
    </main>
  );
}
