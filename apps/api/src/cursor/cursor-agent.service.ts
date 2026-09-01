import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Agent,
  CursorAgentError,
  type SDKAgent,
  type SDKMessage,
} from '@cursor/sdk';
import type { AgentRuntime } from '@riskon/shared';

export interface TriggerRunOptions {
  businessQuestion: string;
  dataSource?: string | null;
  template?: string | null;
  runtime: AgentRuntime;
  repositoryUrl?: string | null;
  onEvent: (event: SDKMessage) => Promise<void>;
}

export interface TriggerRunResult {
  cursorAgentId: string;
  cursorRunId: string;
  status: 'finished' | 'error' | 'cancelled';
  result: string | null;
  errorMessage: string | null;
}

@Injectable()
export class CursorAgentService {
  constructor(private readonly config: ConfigService) {}

  buildPrompt(
    options: Pick<
      TriggerRunOptions,
      'businessQuestion' | 'dataSource' | 'template'
    >,
  ): string {
    const dataLine = options.dataSource
      ? `Data source: ${options.dataSource}`
      : 'No data source was provided; ask the user to clarify or use a bundled dataset from data/.';
    const templateLine = options.template
      ? `Preferred template: ${options.template}`
      : 'Choose the best template from templates/ based on the problem shape.';

    return [
      'You are running inside the riskon-agent Operations Research workstation.',
      'Follow AGENTS.md exactly: inspect data, formulate the model, solve, verify, and write report.md.',
      '',
      `Business question: ${options.businessQuestion}`,
      dataLine,
      templateLine,
      '',
      'Deliverables:',
      '- runs/<timestamp>-<slug>/workbench.duckdb',
      '- runs/<timestamp>-<slug>/model.py',
      '- runs/<timestamp>-<slug>/report.md',
      '',
      'Run riskon doctor first if this is a cold start.',
    ].join('\n');
  }

  async trigger(options: TriggerRunOptions): Promise<TriggerRunResult> {
    const apiKey = this.config.getOrThrow<string>('CURSOR_API_KEY');
    const modelId = this.config.get<string>('CURSOR_MODEL', 'composer-2.5');
    const prompt = this.buildPrompt(options);

    let agent: SDKAgent | undefined;
    try {
      agent = await Agent.create({
        apiKey,
        model: { id: modelId },
        ...(options.runtime === 'cloud'
          ? {
              cloud: {
                repos: options.repositoryUrl
                  ? [{ url: options.repositoryUrl, startingRef: 'main' }]
                  : [],
                skipReviewerRequest: true,
              },
            }
          : {
              local: {
                cwd: this.config.getOrThrow<string>('RISKON_AGENT_PATH'),
                settingSources: [],
              },
            }),
      });

      const run = await agent.send(prompt);
      const cursorAgentId = agent.agentId;
      const cursorRunId = run.id;

      for await (const event of run.stream()) {
        await options.onEvent(event);
      }

      const result = await run.wait();

      return {
        cursorAgentId,
        cursorRunId,
        status: result.status,
        result: result.result ?? null,
        errorMessage:
          result.status === 'error'
            ? 'Agent run failed — inspect events and transcript.'
            : null,
      };
    } catch (error) {
      if (error instanceof CursorAgentError) {
        return {
          cursorAgentId: agent?.agentId ?? 'unknown',
          cursorRunId: 'unknown',
          status: 'error',
          result: null,
          errorMessage: `Startup failed: ${error.message}`,
        };
      }
      throw error;
    } finally {
      if (agent) {
        await agent[Symbol.asyncDispose]();
      }
    }
  }
}
