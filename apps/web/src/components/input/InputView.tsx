import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AnswerQuestionsRequest, RunQuestionRequest } from '@riskon/shared';
import type { DataPreview } from '../../types/risksense';
import type { ActivityEntry } from '../../utils/runEvents';
import { ActivityFeed } from './ActivityFeed';
import { DataPreviewCard } from './DataPreviewCard';
import { QuestionCard } from './QuestionCard';
import { UploadCard } from './UploadCard';

interface Props {
  title: string;
  preview: DataPreview;
  activity: ActivityEntry[];
  pendingQuestion: RunQuestionRequest | null;
  working: boolean;
  uploading: boolean;
  /** Non-null once a dataset has been uploaded for the next run. */
  datasetLabel: string | null;
  error: string | null;
  onFileSelected: (file: File) => void;
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
  title,
  preview,
  activity,
  pendingQuestion,
  working,
  uploading,
  datasetLabel,
  error,
  onFileSelected,
  onAskQuestion,
  onAnswerQuestion,
}: Props) {
  const [input, setInput] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // A new run clears the box; keeping the old text there invites sending it twice.
  useEffect(() => {
    if (working) setInput('');
  }, [working]);

  const composerDisabled = working || pendingQuestion !== null;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    if (question.length < 10 || composerDisabled) return;
    onAskQuestion(question);
    setInput('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <main className="workspace">
      <h1 className="page-title">{title}</h1>

      <div className="data-row">
        <UploadCard
          fileName={datasetLabel ?? preview.fileName ?? 'No file selected'}
          uploading={uploading}
          onFileSelected={onFileSelected}
        />
        <DataPreviewCard preview={preview} />
      </div>

      {error && <p className="banner-error">{error}</p>}

      <section className="chat-panel" aria-label="Run activity">
        <ActivityFeed
          entries={activity}
          working={working}
          emptyMessage={
            datasetLabel
              ? 'Describe the decision you need to make and the agent will get to work.'
              : 'Upload a spreadsheet, then describe the decision you need to make.'
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
            aria-label="Start a run"
            disabled={composerDisabled || input.trim().length < 10}
          >
            <SendIcon />
          </button>
          <p className="composer-hint">
            {composerDisabled
              ? 'The agent is working on the current question.'
              : 'Press Enter to send · Shift + Enter for a new line'}
          </p>
        </form>
      </section>
    </main>
  );
}
