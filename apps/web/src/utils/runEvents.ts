import type { RunEventPayload } from '@riskon/shared';

/**
 * A line the stakeholder can optionally open — how the agent got to an answer,
 * never the answer itself.
 */
export interface Thought {
  id: string;
  text: string;
}

/**
 * A line in the run's activity feed.
 *
 * `say` is the agent talking to the stakeholder. `thoughts` is the working
 * notes that led there, shown collapsed. `user` is what they typed.
 */
export interface ActivityEntry {
  id: string;
  kind: 'user' | 'say' | 'note' | 'thoughts';
  text: string;
  createdAt: string;
  thoughts: Thought[];
}

interface TextBlock {
  type: string;
  text?: string;
}

/** Tool names in language a stakeholder can follow. */
const TOOL_LABELS: Record<string, string> = {
  shell: 'Working through the numbers',
  run_terminal_cmd: 'Working through the numbers',
  read: 'Looking at your data',
  read_file: 'Looking at your data',
  edit: 'Putting the recommendation together',
  edit_file: 'Putting the recommendation together',
  write: 'Putting the recommendation together',
  grep: 'Looking through the data',
  glob: 'Looking through the files',
  ls: 'Looking through the files',
  file_search: 'Looking through the files',
  webFetch: 'Fetching your data',
  webSearch: 'Looking something up',
  mcp: 'Asking you a question',
  get_mcp_tools: 'Asking you a question',
  task: 'Working on a next step',
  updateTodos: 'Planning the next steps',
  todo_write: 'Planning the next steps',
  readTodos: 'Checking the plan',
};

function labelForTool(name: string): string {
  const key = name.replace(/-/g, '_');
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (TOOL_LABELS[key]) return TOOL_LABELS[key];
  const lower = name.toLowerCase();
  if (lower.includes('ask_stakeholder')) return 'Asking you a question';
  if (lower.includes('await_answers')) return 'Waiting for your answer';
  if (lower.includes('notify_stakeholder')) return 'Sending you a note';
  if (lower.includes('get_run_context')) return 'Re-reading what you asked';
  if (lower.includes('terminal') || lower.includes('shell')) {
    return 'Working through the numbers';
  }
  if (lower.includes('mcp')) return 'Asking you a question';
  return 'Working on it';
}

function assistantText(payload: Record<string, unknown>): string {
  const message = payload.message as { content?: TextBlock[] } | undefined;
  return (message?.content ?? [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('');
}

function thinkingText(payload: Record<string, unknown>): string {
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.message === 'string') return payload.message;
  return assistantText(payload);
}

function looksLikeDeliverable(text: string): boolean {
  if (text.length > 400) return true;
  if (/^#{1,3}\s/m.test(text)) return true;
  if (/\|.+\|/.test(text) && /---/.test(text)) return true;
  if (/\bwhat to do next\b/i.test(text)) return true;
  return false;
}

function looksLikeProgress(text: string): boolean {
  if (looksLikeDeliverable(text)) return false;
  const lower = text.toLowerCase();
  return /workstation|agents\.md|mcp\b|pipeline|model\.py|riskon |verification|publish|timed out|retrying|syncing|building and running|got your answers|stakeholder confirmed|follow(ing)? the riskon|this takes about a minute|contacting you/.test(
    lower,
  );
}

/**
 * Turn an internal status line into something a non-technical reader can use.
 */
export function softenThought(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const lower = compact.toLowerCase();

  if (
    /sync(ing)? the workstation|agents\.md|riskon pipeline|full riskon|operations research workflow|riskon doctor/.test(
      lower,
    )
  ) {
    return 'Getting started with your data';
  }
  if (/no price|catalogue|vehicle models|fuel economy/.test(lower) && /ask/.test(lower)) {
    return 'Looked at your file and preparing a few questions';
  }
  if (/timed out|retry/.test(lower) && /stakeholder|question/.test(lower)) {
    return 'Still waiting for your answers';
  }
  if (/got your answers|stakeholder confirmed|using the numbers/.test(lower)) {
    return 'Using the numbers you confirmed';
  }
  if (
    /building|running the|purchase recommendation|fleet procurement model/.test(
      lower,
    )
  ) {
    return 'Working out what to recommend';
  }
  if (/verification|publish/.test(lower)) {
    return 'Checking the answer and preparing your files';
  }
  if (/contacting you|ask_stakeholder|asking the stakeholder/.test(lower)) {
    return 'Asking you a question';
  }
  if (
    /work is complete|preparing a (clear )?summary|non-technical stakeholder/.test(
      lower,
    )
  ) {
    return 'Writing up the recommendation';
  }
  if (/^progress looks good/i.test(compact)) return '';
  if (/load failed|no active run|lock conflict|\bdata loaded\b/.test(lower)) {
    return 'Looking at your data';
  }
  if (/searching for templates|run directory/.test(lower)) return '';
  if (/updating the model|guessed ledger/.test(lower)) {
    return 'Putting the recommendation together';
  }
  if (/sql queries|explore the data/.test(lower)) {
    return 'Looking through the data';
  }

  const cleaned = compact
    .replace(
      /\b(AGENTS\.md|MCP|MILP|CP-SAT|workstation|model\.py|riskon load|riskon doctor|riskon publish|pipeline|workbench\.duckdb|git (?:fetch|reset|changes)|Cursor)\b/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  const sentence = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;
  if (!sentence || sentence.length < 8) return '';
  if (sentence.length <= 120) return sentence;
  return `${sentence.slice(0, 117).trimEnd()}…`;
}

interface Blob {
  id: string;
  kind: 'text' | 'thinking' | 'tool' | 'user' | 'notice';
  text: string;
  createdAt: string;
}

function blobsFrom(events: RunEventPayload[]): Blob[] {
  const blobs: Blob[] = [];
  const seenToolCalls = new Set<string>();
  let openText: Blob | null = null;
  let openThinking: Blob | null = null;

  const closeStreams = () => {
    openText = null;
    openThinking = null;
  };

  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.eventType) {
      case 'assistant': {
        const text = assistantText(payload);
        if (!text) break;
        if (openText) {
          openText.text += text;
        } else {
          openText = {
            id: event.id,
            kind: 'text',
            text,
            createdAt: event.createdAt,
          };
          blobs.push(openText);
        }
        break;
      }

      case 'thinking': {
        const text = thinkingText(payload);
        if (!text) break;
        if (openThinking) {
          openThinking.text += text;
        } else {
          openThinking = {
            id: event.id,
            kind: 'thinking',
            text,
            createdAt: event.createdAt,
          };
          blobs.push(openThinking);
        }
        break;
      }

      case 'tool_call': {
        closeStreams();
        const callId = String(payload.call_id ?? event.id);
        if (seenToolCalls.has(callId)) break;
        seenToolCalls.add(callId);
        blobs.push({
          id: event.id,
          kind: 'tool',
          text: labelForTool(String(payload.name ?? 'working')),
          createdAt: event.createdAt,
        });
        break;
      }

      case 'agent_notice': {
        closeStreams();
        blobs.push({
          id: event.id,
          kind: 'notice',
          text: String(payload.message ?? ''),
          createdAt: event.createdAt,
        });
        break;
      }

      case 'task': {
        closeStreams();
        const text = String(payload.text ?? '').trim();
        if (text) {
          blobs.push({
            id: event.id,
            kind: 'tool',
            text: softenThought(text) || 'Working on the next step',
            createdAt: event.createdAt,
          });
        }
        break;
      }

      case 'user': {
        closeStreams();
        const text =
          String(payload.text ?? payload.content ?? '').trim() ||
          assistantText(payload).trim();
        if (text) {
          blobs.push({
            id: event.id,
            kind: 'user',
            text,
            createdAt: event.createdAt,
          });
        }
        break;
      }

      // Durable transcript after the live stream expires. Same work as the
      // stream events above, packed into one turn with a different shape.
      case 'agentConversationTurn': {
        closeStreams();
        blobs.push(...blobsFromConversationTurn(event.id, event.createdAt, payload));
        break;
      }

      default:
        break;
    }
  }

  return blobs.filter((blob) => blob.text.trim().length > 0);
}

/**
 * Cursor's `conversation()` copy of a turn, used when the live stream died.
 * Steps are thinking / assistant / tool, nested under `turn.steps`.
 */
function blobsFromConversationTurn(
  eventId: string,
  createdAt: string,
  payload: Record<string, unknown>,
): Blob[] {
  const nested = payload.turn as { steps?: unknown[] } | undefined;
  const steps = Array.isArray(nested?.steps) ? nested.steps : [];
  const blobs: Blob[] = [];

  for (const [index, raw] of steps.entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as Record<string, unknown>;
    const message = (step.message ?? {}) as Record<string, unknown>;
    const id = `${eventId}-${index}`;

    if (step.type === 'thinkingMessage') {
      const text = String(message.text ?? '').trim();
      if (text) {
        blobs.push({ id, kind: 'thinking', text, createdAt });
      }
      continue;
    }

    if (step.type === 'assistantMessage') {
      const text = String(message.text ?? '').trim();
      if (text) {
        blobs.push({ id, kind: 'text', text, createdAt });
      }
      continue;
    }

    if (step.type === 'toolCall') {
      const args = (message.args ?? {}) as Record<string, unknown>;
      const name = String(args.toolName ?? message.type ?? 'working');
      blobs.push({
        id,
        kind: 'tool',
        text: labelForTool(name),
        createdAt,
      });
    }
  }

  return blobs;
}

function isStakeholderText(
  blob: Blob,
  rest: Blob[],
  stillWorking: boolean,
): boolean {
  if (blob.kind !== 'text') return false;
  if (looksLikeDeliverable(blob.text)) return true;
  // While the run is in flight, leftover assistant text is working notes —
  // not a message. Otherwise the first tokens hide the dropdown.
  if (stillWorking) return false;
  if (looksLikeProgress(blob.text)) return false;
  if (rest.some((item) => item.kind === 'tool')) return false;
  return blob.text.trim().length > 0;
}

function pushThought(thoughts: Thought[], thought: Thought): void {
  const text = thought.text.trim();
  if (!text) return;
  if (thoughts.some((item) => item.text === text)) return;
  thoughts.push({ ...thought, text });
}

export function toActivity(
  events: RunEventPayload[],
  options: { openingQuestion?: string | null; stillWorking?: boolean } = {},
): ActivityEntry[] {
  const blobs = blobsFrom(events);
  const entries: ActivityEntry[] = [];
  let pending: Thought[] = [];

  const flushThoughts = (createdAt: string) => {
    if (pending.length === 0) return;
    entries.push({
      id: pending[0].id,
      kind: 'thoughts',
      text: '',
      createdAt,
      thoughts: pending,
    });
    pending = [];
  };

  if (options.openingQuestion?.trim()) {
    entries.push({
      id: 'opening-question',
      kind: 'user',
      text: options.openingQuestion.trim(),
      createdAt: events[0]?.createdAt ?? new Date().toISOString(),
      thoughts: [],
    });
  }

  for (let index = 0; index < blobs.length; index += 1) {
    const blob = blobs[index];
    const rest = blobs.slice(index + 1);

    if (blob.kind === 'user') {
      flushThoughts(blob.createdAt);
      if (blob.text.trim() === options.openingQuestion?.trim()) continue;
      entries.push({
        id: blob.id,
        kind: 'user',
        text: blob.text,
        createdAt: blob.createdAt,
        thoughts: [],
      });
      continue;
    }

    if (blob.kind === 'tool' || blob.kind === 'thinking') {
      const text =
        blob.kind === 'thinking' ? softenThought(blob.text) : blob.text;
      if (text) {
        pushThought(pending, { id: blob.id, text });
      }
      continue;
    }

    if (blob.kind === 'notice') {
      const friendly = softenThought(blob.text);
      const isWarning = /cannot fetch|not reachable|published no files/i.test(
        blob.text,
      );
      if (isWarning) {
        flushThoughts(blob.createdAt);
        entries.push({
          id: blob.id,
          kind: 'note',
          text: blob.text,
          createdAt: blob.createdAt,
          thoughts: [],
        });
      } else {
        pushThought(pending, {
          id: blob.id,
          text: friendly || blob.text,
        });
      }
      continue;
    }

    if (isStakeholderText(blob, rest, options.stillWorking === true)) {
      flushThoughts(blob.createdAt);
      entries.push({
        id: blob.id,
        kind: 'say',
        text: blob.text,
        createdAt: blob.createdAt,
        thoughts: [],
      });
    } else {
      const text = softenThought(blob.text);
      if (text) {
        pushThought(pending, { id: blob.id, text });
      }
    }
  }

  if (pending.length > 0) {
    flushThoughts(blobs[blobs.length - 1]?.createdAt ?? new Date().toISOString());
  }

  return entries.filter(
    (entry) =>
      entry.kind === 'thoughts' ||
      entry.kind === 'user' ||
      entry.text.trim().length > 0,
  );
}

/** The agent's closing summary, which is the sentence to lead with. */
export function lastAgentMessage(entries: ActivityEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].kind === 'say') return entries[i].text;
  }
  return null;
}

/**
 * If the timeline never produced a stakeholder-facing message, use the
 * run's stored result so a finished answer is not invisible in chat.
 */
export function withClosingResult(
  entries: ActivityEntry[],
  result: string | null | undefined,
  createdAt: string,
): ActivityEntry[] {
  if (!result?.trim()) return entries;
  if (entries.some((entry) => entry.kind === 'say')) return entries;
  return [
    ...entries,
    {
      id: 'run-result',
      kind: 'say',
      text: result,
      createdAt,
      thoughts: [],
    },
  ];
}
