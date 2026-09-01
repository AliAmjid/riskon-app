import type { RunEventPayload } from '@riskon/shared';

/**
 * A line in the run's activity feed.
 *
 * `say` is the agent talking; `do` is the agent working. The distinction is
 * what lets the UI show the reasoning prominently and the tool traffic quietly.
 */
export interface ActivityEntry {
  id: string;
  kind: 'say' | 'do' | 'note' | 'thinking';
  text: string;
  createdAt: string;
}

interface TextBlock {
  type: string;
  text?: string;
}

/** Tool names the agent uses, in language a stakeholder can follow. */
const TOOL_LABELS: Record<string, string> = {
  shell: 'Running a command',
  read: 'Reading a file',
  edit: 'Writing a file',
  write: 'Writing a file',
  grep: 'Searching the data',
  glob: 'Looking for files',
  ls: 'Listing files',
  webFetch: 'Fetching your data',
  webSearch: 'Searching the web',
  mcp: 'Contacting you',
  task: 'Delegating a sub-task',
  updateTodos: 'Planning',
  readTodos: 'Checking its plan',
};

function labelForTool(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  // MCP tool calls arrive with the server name prefixed.
  if (name.includes('ask_stakeholder')) return 'Asking you a question';
  if (name.includes('await_answers')) return 'Waiting for your answer';
  if (name.includes('notify_stakeholder')) return 'Sending you a note';
  if (name.includes('get_run_context')) return 'Re-reading your brief';
  return name.replace(/_/g, ' ');
}

/**
 * Turn the raw Cursor event stream into something worth reading.
 *
 * The stream is verbose and repetitive — a single tool call arrives as a
 * `running` event and then a `completed` one, and assistant messages carry
 * tool-use blocks alongside their text. Only the parts that tell the
 * stakeholder what is happening survive this.
 */
export function toActivity(events: RunEventPayload[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  const seenToolCalls = new Set<string>();

  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.eventType) {
      case 'assistant': {
        const message = payload.message as { content?: TextBlock[] } | undefined;
        const text = (message?.content ?? [])
          .filter((block) => block.type === 'text' && block.text?.trim())
          .map((block) => block.text!.trim())
          .join('\n\n');
        if (text) {
          entries.push({
            id: event.id,
            kind: 'say',
            text,
            createdAt: event.createdAt,
          });
        }
        break;
      }

      case 'tool_call': {
        // One line per call, on first sight, rather than one per status change.
        const callId = String(payload.call_id ?? event.id);
        if (seenToolCalls.has(callId)) break;
        seenToolCalls.add(callId);
        entries.push({
          id: event.id,
          kind: 'do',
          text: labelForTool(String(payload.name ?? 'working')),
          createdAt: event.createdAt,
        });
        break;
      }

      case 'agent_notice': {
        entries.push({
          id: event.id,
          kind: 'note',
          text: String(payload.message ?? ''),
          createdAt: event.createdAt,
        });
        break;
      }

      case 'task': {
        const text = String(payload.text ?? '').trim();
        if (text) {
          entries.push({
            id: event.id,
            kind: 'do',
            text,
            createdAt: event.createdAt,
          });
        }
        break;
      }

      // `thinking`, `system`, `status`, `usage` and `user` are either internal
      // bookkeeping or already reflected in the run's status pill.
      default:
        break;
    }
  }

  return entries;
}

/** The agent's closing summary, which is the sentence to lead with. */
export function lastAgentMessage(entries: ActivityEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].kind === 'say') return entries[i].text;
  }
  return null;
}
