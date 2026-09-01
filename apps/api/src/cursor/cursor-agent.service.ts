import { Injectable, Logger } from '@nestjs/common';
import {
  Agent,
  CursorAgentError,
  type AgentOptions,
  type ConversationTurn,
  type Run,
  type SDKAgent,
  type SDKArtifact,
  type SDKMessage,
} from '@cursor/sdk';
import type { AgentRuntime } from '@riskon/shared';
import { AppConfig } from '../config/app-config.js';

export interface TriggerRunOptions {
  runId: string;
  title: string;
  businessQuestion: string;
  dataSource?: string | null;
  dataFilename?: string | null;
  template?: string | null;
  runtime: AgentRuntime;
  repositoryUrl?: string | null;
  startingRef?: string | null;
  /** Appended to the MCP URL so tool calls resolve back to this run. */
  mcpToken: string;
  onEvent: (event: SDKMessage) => Promise<void>;
  /** Used only when the live stream delivered nothing; see backfillTimeline. */
  onTranscriptTurn: (turn: ConversationTurn) => Promise<void>;
  onAgentStarted: (ids: {
    cursorAgentId: string;
    cursorRunId: string;
  }) => Promise<void>;
  /**
   * Called once per published file, after the run ends and before the agent is
   * disposed. Cursor's download URLs are presigned for 15 minutes and the agent
   * handle is the only way to mint them, so this is the one chance to pull them.
   */
  onArtifact: (artifact: SDKArtifact, body: Buffer) => Promise<void>;
}

export interface TriggerRunResult {
  cursorAgentId: string | null;
  cursorRunId: string | null;
  status: 'finished' | 'error' | 'cancelled';
  result: string | null;
  errorMessage: string | null;
  artifactCount: number;
}

/** Cursor collects whatever the agent writes under this directory. */
const ARTIFACT_PREFIX = 'artifacts/';

@Injectable()
export class CursorAgentService {
  private readonly logger = new Logger(CursorAgentService.name);

  constructor(private readonly config: AppConfig) {}

  buildPrompt(options: TriggerRunOptions): string {
    const ref = options.startingRef ?? this.config.agentRepositoryRef;

    const lines = [
      'You are running headless in the riskon Operations Research workstation.',
      '',
      // The cloud workspace is a cached snapshot that does not re-clone, so a
      // run can otherwise execute months-old instructions against a current
      // question — and AGENTS.md, read from that same snapshot, cannot say so.
      'Before anything else, sync the workstation. Your checkout is a cached',
      'snapshot and is probably behind:',
      '',
      `    cd /workspace && git fetch --quiet origin ${ref} && git reset --hard --quiet FETCH_HEAD`,
      '',
      'Then read AGENTS.md and follow it exactly, all nine steps, in order.',
      '',
      `Business question: ${options.businessQuestion}`,
    ];

    if (options.dataSource) {
      const named = options.dataFilename
        ? ` (the stakeholder uploaded "${options.dataFilename}")`
        : '';
      lines.push(
        `Data${named}: ${options.dataSource}`,
        `Ingest it with: riskon load "${options.dataSource}"`,
      );
    } else {
      lines.push(
        'No data was attached. Ask the stakeholder which dataset to use before modelling;',
        'the bundled sets in data/ are a fallback, not a substitute for asking.',
      );
    }

    lines.push(
      options.template
        ? `Preferred template: ${options.template}`
        : 'Choose the template from templates/ that matches the problem shape.',
      '',
      'Two things are easy to get wrong here, so they are spelled out:',
      '',
      '1. Nobody is reading this transcript. The person who asked the question is watching a',
      '   web page. The riskon MCP server is connected: use ask_stakeholder for every',
      '   must-ask number, and wait for the answer. A question written here reaches nobody,',
      '   and a model built on invented numbers answers a question nobody asked.',
      '',
      '2. Finish with `riskon publish`. It resolves the artifacts store, which is the only',
      '   directory collected from this machine and is not inside your checkout — a report',
      '   left in runs/, or hand-copied to ./artifacts/, reaches nobody. Check the file list',
      '   it prints is not empty, and that report.md is in it.',
      '',
      'Close your final message with the headline recommendation in one sentence.',
    );

    return lines.join('\n');
  }

  async trigger(options: TriggerRunOptions): Promise<TriggerRunResult> {
    const prompt = this.buildPrompt(options);
    let agent: SDKAgent | undefined;
    let cursorRunId: string | null = null;

    try {
      agent = await Agent.create(this.agentOptions(options));

      const run = await agent.send(prompt);
      cursorRunId = run.id;
      // Log the identifiers before streaming: if the stream hangs, these are
      // what makes the run findable in the Cursor dashboard.
      this.logger.log(
        `Run ${options.runId} -> agent ${agent.agentId}, cursor run ${run.id}`,
      );
      await options.onAgentStarted({
        cursorAgentId: agent.agentId,
        cursorRunId: run.id,
      });

      // Start the wait before touching the stream, and never await the stream
      // ahead of it. A cloud SSE stream can close early — the run keeps going —
      // and consuming it to exhaustion first makes `wait()` fail with
      // `stream_unavailable`, turning a healthy run into a reported error.
      const waiting = run.wait();
      const streamed = this.streamEvents(run, options);

      const result = await waiting;
      const eventCount = await streamed;

      // The stream is best-effort, so a run that ends without it having
      // delivered anything still needs a timeline.
      if (eventCount === 0) {
        await this.backfillTimeline(run, options);
      }

      const artifactCount = await this.collectArtifacts(agent, options);

      return {
        cursorAgentId: agent.agentId,
        cursorRunId: run.id,
        status: result.status,
        result: result.result ?? null,
        errorMessage:
          result.status === 'finished'
            ? null
            : this.describeRunFailure(
                result.status,
                artifactCount,
                result.error?.message,
              ),
        artifactCount,
      };
    } catch (error) {
      // A thrown CursorAgentError means the run never executed — auth, config,
      // network. Distinct from a run that started and failed, which arrives as
      // result.status above and may still have published something.
      if (error instanceof CursorAgentError) {
        this.logger.error(`Run ${options.runId} never started: ${error.message}`);
        return {
          cursorAgentId: agent?.agentId ?? null,
          cursorRunId,
          status: 'error',
          result: null,
          errorMessage: `The agent could not be started: ${error.message}`,
          artifactCount: 0,
        };
      }
      throw error;
    } finally {
      if (agent) {
        await agent[Symbol.asyncDispose]();
      }
    }
  }

  /**
   * Forward live events, tolerating a stream that dies before the run does.
   *
   * Losing the stream costs the stakeholder a live timeline, which is a
   * degraded page rather than a failed run, so it is never allowed to reject.
   */
  private async streamEvents(
    run: Run,
    options: TriggerRunOptions,
  ): Promise<number> {
    if (!run.supports('stream')) {
      this.logger.warn(
        `Run ${options.runId} cannot stream: ${run.unsupportedReason('stream')}`,
      );
      return 0;
    }

    let count = 0;
    try {
      for await (const event of run.stream()) {
        count += 1;
        await options.onEvent(event);
      }
    } catch (error) {
      this.logger.warn(
        `Run ${options.runId} stream ended early after ${count} event(s): ${String(error)}`,
      );
    }
    return count;
  }

  /**
   * Rebuild the timeline from the finished transcript.
   *
   * Cloud streams are only retained for a window after the run starts, so a
   * long run can outlive its own stream. `conversation()` is the durable copy.
   */
  private async backfillTimeline(
    run: Run,
    options: TriggerRunOptions,
  ): Promise<void> {
    if (!run.supports('conversation')) return;

    try {
      const turns = await run.conversation();
      for (const turn of turns) {
        await options.onTranscriptTurn(turn);
      }
      this.logger.log(
        `Run ${options.runId} timeline backfilled from ${turns.length} turn(s)`,
      );
    } catch (error) {
      this.logger.warn(
        `Run ${options.runId} could not backfill its timeline: ${String(error)}`,
      );
    }
  }

  private agentOptions(options: TriggerRunOptions): AgentOptions {
    const base: AgentOptions = {
      apiKey: this.config.cursorApiKey,
      model: { id: this.config.cursorModel },
      name: `riskon: ${options.title}`.slice(0, 120),
    };

    if (options.runtime === 'local') {
      const cwd = this.config.localAgentPath;
      if (!cwd) {
        throw new CursorAgentError(
          'RISKON_AGENT_PATH is not set, so there is no local checkout to run in. ' +
            'Use the cloud runtime, or set the path.',
        );
      }
      // No MCP server: a cloud-facing public URL is pointless here, and local
      // agents produce no artifacts either way.
      return { ...base, local: { cwd, settingSources: [] } };
    }

    const repositoryUrl =
      options.repositoryUrl ?? this.config.agentRepositoryUrl;

    return {
      ...base,
      cloud: {
        repos: [
          {
            url: repositoryUrl,
            startingRef: options.startingRef ?? this.config.agentRepositoryRef,
          },
        ],
        // This is a report pipeline, not a code change: no branch to review.
        skipReviewerRequest: true,
        autoCreatePR: false,
        metadata: { riskonRunId: options.runId },
      },
      ...(this.config.isPubliclyReachable
        ? {
            mcpServers: {
              riskon: {
                type: 'http' as const,
                url: `${this.config.publicBaseUrl}/mcp/${options.mcpToken}`,
              },
            },
          }
        : {}),
    };
  }

  /**
   * Pull everything the agent published. Failures here are logged rather than
   * thrown: a run that produced a good answer but lost one file is still worth
   * far more to the stakeholder than an error page.
   */
  private async collectArtifacts(
    agent: SDKAgent,
    options: TriggerRunOptions,
  ): Promise<number> {
    if (options.runtime !== 'cloud') {
      return 0;
    }

    let artifacts: SDKArtifact[];
    try {
      artifacts = await agent.listArtifacts();
    } catch (error) {
      this.logger.error(
        `Could not list artifacts for run ${options.runId}: ${String(error)}`,
      );
      return 0;
    }

    let collected = 0;
    for (const artifact of artifacts) {
      try {
        const body = await agent.downloadArtifact(artifact.path);
        await options.onArtifact(artifact, body);
        collected += 1;
      } catch (error) {
        this.logger.error(
          `Could not download ${artifact.path} for run ${options.runId}: ${String(error)}`,
        );
      }
    }

    this.logger.log(
      `Run ${options.runId} published ${collected}/${artifacts.length} artifact(s)`,
    );
    return collected;
  }

  /** Strip the collection prefix so stored paths read as filenames. */
  static relativeArtifactPath(path: string): string {
    return path.startsWith(ARTIFACT_PREFIX)
      ? path.slice(ARTIFACT_PREFIX.length)
      : path;
  }

  /**
   * The failure, for someone non-technical, without hiding the cause.
   *
   * The SDK's own message is appended rather than swallowed: when a run breaks
   * for an infrastructure reason it is the only thing that says which, and
   * discovering that means re-running and watching the logs.
   */
  private describeRunFailure(
    status: string,
    artifactCount: number,
    cause?: string,
  ): string {
    const detail = cause ? ` (${cause})` : '';

    if (status === 'cancelled') {
      return `The run was cancelled before it finished.${detail}`;
    }
    return artifactCount > 0
      ? `The agent stopped before finishing, but it did publish some files — check them before acting.${detail}`
      : `The agent stopped before finishing and published nothing. The timeline below shows how far it got.${detail}`;
  }
}
