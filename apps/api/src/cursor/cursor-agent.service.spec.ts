import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Agent,
  type ConversationTurn,
  type Run,
  type RunStatus,
  type SDKMessage,
} from '@cursor/sdk';
import { CursorAgentService } from './cursor-agent.service.js';
import type { AppConfig } from '../config/app-config.js';
import type { TriggerRunOptions } from './cursor-agent.service.js';

const config = {
  cursorApiKey: 'test-key',
  runPollSeconds: 0.01,
  runPollTimeoutSeconds: 2,
} as AppConfig;

function serviceUnderTest() {
  // The stream/settle pair is internal by design: callers only ever see a
  // finished run. Reaching in is what lets the lost-stream path be tested
  // without a cloud agent.
  return new CursorAgentService(config) as unknown as {
    streamEvents(run: Run, options: unknown, progress: unknown): Promise<void>;
    settle(
      run: Run,
      agentId: string,
      options: unknown,
      progress: unknown,
    ): Promise<{ status: string; result?: string; error?: { message: string } }>;
  };
}

/** Cursor drops the connection rather than ending the stream politely. */
function lostStream(): AsyncGenerator<SDKMessage, void> {
  return {
    next: () => Promise.reject(new Error('Run stream is no longer available')),
    return: () => Promise.resolve({ value: undefined, done: true }),
    throw: (error: unknown) => Promise.reject(error),
    [Symbol.asyncIterator]() {
      return this;
    },
  } as AsyncGenerator<SDKMessage, void>;
}

function fakeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-abc',
    agentId: 'bc-1',
    status: 'running' as RunStatus,
    supports: () => true,
    unsupportedReason: () => undefined,
    stream: lostStream,
    conversation: async () => [],
    wait: async () => ({
      id: 'run-abc',
      status: 'error' as const,
      error: { message: 'Run stream is no longer available' },
    }),
    cancel: async () => {},
    onDidChangeStatus: () => () => {},
    ...overrides,
  } as Run;
}

function recordingOptions(): {
  options: TriggerRunOptions;
  turns: ConversationTurn[];
} {
  const turns: ConversationTurn[] = [];
  return {
    turns,
    options: {
      runId: 'run-under-test',
      runtime: 'cloud',
      onEvent: async () => {},
      onTranscriptTurn: async (turn) => {
        turns.push(turn);
      },
    } as unknown as TriggerRunOptions,
  };
}

describe('CursorAgentService, when a run outlives its event stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports what the run really did rather than the stream failure', async () => {
    const service = serviceUnderTest();
    const { options, turns } = recordingOptions();
    const transcript = [
      [{ type: 'a' }],
      [{ type: 'a' }, { type: 'b' }],
      [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
    ] as unknown as ConversationTurn[][];

    let polls = 0;
    vi.spyOn(Agent, 'getRun').mockImplementation(async () => {
      const seen = polls;
      polls += 1;
      const done = polls >= 3;
      return fakeRun({
        status: (done ? 'finished' : 'running') as RunStatus,
        result: done ? 'Buy 10 vehicles.' : undefined,
        error: undefined,
        conversation: async () =>
          transcript[Math.min(seen, transcript.length - 1)],
      });
    });

    const progress = { streamed: 0, backfilled: 0 };
    const run = fakeRun();
    await service.streamEvents(run, options, progress);
    const settled = await service.settle(run, 'bc-1', options, progress);

    expect(settled.status).toBe('finished');
    expect(settled.result).toBe('Buy 10 vehicles.');
    // Each transcript turn reaches the timeline exactly once, so the
    // stakeholder sees progress without seeing it twice.
    expect(turns.map((turn) => turn.type)).toEqual(['a', 'b', 'c']);
  });

  it('leaves a genuine failure alone', async () => {
    const service = serviceUnderTest();
    const { options } = recordingOptions();
    const getRun = vi
      .spyOn(Agent, 'getRun')
      .mockRejectedValue(new Error('should not be polled'));

    const settled = await service.settle(
      fakeRun({
        wait: async () => ({
          id: 'run-abc',
          status: 'error' as const,
          error: { message: 'the sandbox ran out of disk' },
        }),
      }),
      'bc-1',
      options,
      { streamed: 12, backfilled: 0 },
    );

    expect(settled.status).toBe('error');
    expect(settled.error?.message).toBe('the sandbox ran out of disk');
    expect(getRun).not.toHaveBeenCalled();
  });

  it('passes a healthy run straight through', async () => {
    const service = serviceUnderTest();
    const { options } = recordingOptions();
    const getRun = vi
      .spyOn(Agent, 'getRun')
      .mockRejectedValue(new Error('should not be polled'));

    const settled = await service.settle(
      fakeRun({
        wait: async () => ({
          id: 'run-abc',
          status: 'finished' as const,
          result: 'done',
        }),
      }),
      'bc-1',
      options,
      { streamed: 400, backfilled: 0 },
    );

    expect(settled.status).toBe('finished');
    expect(settled.result).toBe('done');
    expect(getRun).not.toHaveBeenCalled();
  });
});
