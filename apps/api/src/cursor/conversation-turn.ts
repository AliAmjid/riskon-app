import type { ConversationTurn } from '@cursor/sdk';

export interface TimelineEvent {
  eventType: string;
  payload: Record<string, unknown>;
}

interface TurnStep {
  type?: string;
  message?: {
    text?: string;
    type?: string;
    args?: { toolName?: string };
  };
}

/**
 * Expand a durable conversation turn into the same event types the live
 * stream uses. Cursor's `conversation()` copy is one nested object; the
 * chat feed already knows how to render `thinking` / `assistant` / `tool_call`.
 */
export function timelineEventsFromTurn(turn: ConversationTurn): TimelineEvent[] {
  const record = turn as unknown as {
    type?: string;
    turn?: { steps?: TurnStep[] };
  };

  if (record.type !== 'agentConversationTurn') {
    return [
      {
        eventType: String(record.type ?? 'unknown'),
        payload: record as Record<string, unknown>,
      },
    ];
  }

  const events: TimelineEvent[] = [];
  for (const [index, step] of (record.turn?.steps ?? []).entries()) {
    if (step.type === 'thinkingMessage') {
      const text = step.message?.text?.trim();
      if (text) {
        events.push({
          eventType: 'thinking',
          payload: { text, source: 'conversation', step: index },
        });
      }
      continue;
    }

    if (step.type === 'assistantMessage') {
      const text = step.message?.text?.trim();
      if (text) {
        events.push({
          eventType: 'assistant',
          payload: {
            message: { content: [{ type: 'text', text }] },
            source: 'conversation',
            step: index,
          },
        });
      }
      continue;
    }

    if (step.type === 'toolCall') {
      const name = step.message?.args?.toolName ?? step.message?.type ?? 'working';
      events.push({
        eventType: 'tool_call',
        payload: {
          name,
          call_id: `conversation-${index}`,
          source: 'conversation',
          step: index,
        },
      });
    }
  }

  return events;
}
