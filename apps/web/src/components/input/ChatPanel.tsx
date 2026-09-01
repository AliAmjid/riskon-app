import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../../types/risksense';
import { ChatMessageRow } from './ChatMessageRow';

interface Props {
  messages: ChatMessage[];
  onSend: (question: string) => void;
  disabled?: boolean;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function ChatPanel({ messages, onSend, disabled = false }: Props) {
  const [input, setInput] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  function submitQuestion(event?: FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || disabled) return;
    onSend(question);
    setInput('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
    }
  }

  return (
    <section className="chat-panel" aria-label="Optimization chat">
      <div className="messages" ref={messagesRef} aria-live="polite">
        {messages.map((message) => (
          <ChatMessageRow key={message.id} message={message} />
        ))}
      </div>

      <form className="composer" onSubmit={submitQuestion}>
        <label className="sr-only" htmlFor="chat-input">
          Business question
        </label>
        <textarea
          id="chat-input"
          rows={2}
          placeholder="Describe the business decision you want to optimize…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          required
          disabled={disabled}
        />
        <button
          className="send-button"
          type="submit"
          aria-label="Send message"
          disabled={disabled || !input.trim()}
        >
          <SendIcon />
        </button>
        <p className="composer-hint">Press Enter to send · Shift + Enter for a new line</p>
      </form>
    </section>
  );
}
