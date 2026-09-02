import { describe, expect, it } from 'vitest';
import type { ConversationTurn } from '@cursor/sdk';
import { timelineEventsFromTurn } from './conversation-turn.js';

describe('timelineEventsFromTurn', () => {
  it('expands an agent conversation turn into stream-shaped events', () => {
    const turn = {
      type: 'agentConversationTurn',
      turn: {
        steps: [
          { type: 'thinkingMessage', message: { text: 'Look at the file' } },
          {
            type: 'assistantMessage',
            message: { text: 'Your fleet should be 8 vehicles.' },
          },
          {
            type: 'toolCall',
            message: {
              type: 'mcp',
              args: { toolName: 'ask_stakeholder' },
            },
          },
        ],
      },
    } as unknown as ConversationTurn;

    const events = timelineEventsFromTurn(turn);

    expect(events.map((event) => event.eventType)).toEqual([
      'thinking',
      'assistant',
      'tool_call',
    ]);
    expect(events[0].payload.text).toBe('Look at the file');
    expect(
      (events[1].payload.message as { content: { text: string }[] }).content[0]
        .text,
    ).toBe('Your fleet should be 8 vehicles.');
    expect(events[2].payload.name).toBe('ask_stakeholder');
  });
});
