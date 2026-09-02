import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivityEntry, Thought } from '../../utils/runEvents';
import { renderMarkdown } from '../../utils/markdown';

interface Props {
  entries: ActivityEntry[];
  /** True while the agent is working, so the feed shows it is not stalled. */
  working: boolean;
  emptyMessage?: string;
  emptySlot?: ReactNode;
}

interface Turn {
  id: string;
  user: ActivityEntry | null;
  thoughts: Thought[];
  messages: ActivityEntry[];
}

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

function groupTurns(entries: ActivityEntry[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn = { id: 'turn-0', user: null, thoughts: [], messages: [] };

  const flush = () => {
    if (current.user || current.thoughts.length > 0 || current.messages.length > 0) {
      turns.push(current);
    }
    current = {
      id: `turn-${turns.length}`,
      user: null,
      thoughts: [],
      messages: [],
    };
  };

  for (const entry of entries) {
    if (entry.kind === 'user') {
      flush();
      current.id = entry.id;
      current.user = entry;
      continue;
    }
    if (entry.kind === 'thoughts') {
      current.thoughts.push(...entry.thoughts);
      continue;
    }
    current.thoughts.push(...entry.thoughts);
    current.messages.push(entry);
  }
  flush();
  return turns;
}

function Thoughts({
  thoughts,
  defaultOpen,
  live,
}: {
  thoughts: Thought[];
  defaultOpen: boolean;
  live: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
    else if (!live) setOpen(false);
  }, [defaultOpen, live]);

  if (thoughts.length === 0 && !live) return null;

  return (
    <details
      className="thoughts"
      open={open}
      onToggle={(event) => {
        setOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      {/* The spinner sits in the summary rather than at the end of the list so
          it stays visible whether the notes are expanded or collapsed. */}
      <summary>
        {live ? (
          <span className="processing">
            <span className="spinner" />
            <span>Working…</span>
          </span>
        ) : open ? (
          'Hide working notes'
        ) : (
          'Working it out'
        )}
      </summary>
      <ul>
        {thoughts.map((thought) => (
          <li key={thought.id}>{thought.text}</li>
        ))}
      </ul>
    </details>
  );
}

export function ActivityFeed({
  entries,
  working,
  emptyMessage,
  emptySlot,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const turns = groupTurns(entries);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [entries, working]);

  const lastTurnIndex = turns.length - 1;
  const lastTurn = turns[lastTurnIndex];

  // The working notes carry the spinner while they are the newest thing on
  // screen. Once the agent has said something they are not, so the spinner
  // moves below the message — otherwise a run that reports progress part way
  // through looks finished for as long as it keeps working.
  const trailingStatus =
    working && (lastTurn == null || lastTurn.messages.length > 0);

  return (
    <div className="messages" ref={scrollRef} aria-live="polite">
      {entries.length === 0 &&
        !working &&
        (emptySlot ??
          (emptyMessage ? <p className="feed-empty">{emptyMessage}</p> : null))}

      {turns.map((turn, index) => {
        const isLast = index === lastTurnIndex;
        const liveThoughts = working && isLast && turn.messages.length === 0;

        return (
          <div key={turn.id} className="turn">
            {turn.user && (
              <div className="message-row user">
                <div>
                  <div className="bubble bubble-user">{turn.user.text}</div>
                  <div className="message-time">
                    {formatTime(turn.user.createdAt)}
                  </div>
                </div>
              </div>
            )}

            <Thoughts
              thoughts={turn.thoughts}
              defaultOpen={liveThoughts}
              live={liveThoughts}
            />

            {turn.messages.map((entry) => (
              <div
                key={entry.id}
                className={`message-row agent ${entry.kind === 'note' ? 'note' : ''}`}
              >
                <div className="agent-mark">AI</div>
                <div>
                  {entry.kind === 'say' ? (
                    <div
                      className="bubble bubble-md markdown-body"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(entry.text),
                      }}
                    />
                  ) : (
                    <div className="bubble">{entry.text}</div>
                  )}
                  <div className="message-time">
                    {formatTime(entry.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {trailingStatus && (
        <div className="message-row agent">
          <div className="agent-mark">AI</div>
          <div>
            <div className="bubble bubble-status">
              <span className="processing">
                <span className="spinner" />
                <span>Working…</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
