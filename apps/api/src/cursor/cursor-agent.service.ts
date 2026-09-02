import { Injectable, Logger } from '@nestjs/common';
import {
  Agent,
  CursorAgentError,
  type AgentOptions,
  type ConversationTurn,
  type Run,
  type RunResult,
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
  dataFiles?: { filename: string; url: string }[];
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

export interface ContinueRunOptions extends Omit<
  TriggerRunOptions,
  'businessQuestion' | 'dataSource' | 'dataFilename' | 'dataFiles' | 'template'
> {
  cursorAgentId: string;
  message: string;
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

/**
 * Cursor retains a run's event stream for a window rather than for the run's
 * whole life, so a slow run can outlive it. When that happens `wait()` reports
 * failure — but the agent is still working, so the report is about the stream
 * and not about the run.
 */
const LOST_STREAM = /stream is no longer available|stream (?:closed|expired|ended|unavailable)/i;

/** How far a turn has been mirrored into the timeline, across both routes. */
interface TurnProgress {
  /** Events the live stream delivered. Zero means the transcript is our only copy. */
  streamed: number;
  /** Conversation turns already written, so a re-read does not duplicate them. */
  backfilled: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    const dataFiles =
      options.dataFiles && options.dataFiles.length > 0
        ? options.dataFiles
        : options.dataSource
          ? [
              {
                filename: options.dataFilename ?? 'uploaded file',
                url: options.dataSource,
              },
            ]
          : [];

    if (dataFiles.length > 0) {
      lines.push(
        dataFiles.length === 1
          ? `Data (the stakeholder uploaded "${dataFiles[0].filename}"): ${dataFiles[0].url}`
          : 'Data the stakeholder uploaded:',
      );
      if (dataFiles.length === 1) {
        lines.push(`Ingest it with: riskon load "${dataFiles[0].url}"`);
      } else {
        for (const file of dataFiles) {
          lines.push(`- ${file.filename}: ${file.url}`);
          lines.push(`  Ingest with: riskon load "${file.url}"`);
        }
      }
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

  buildFollowUpPrompt(message: string): string {
    return [
      'The stakeholder followed up. This is the same decision, not a new one.',
      'Do not sync the workstation or start a fresh run unless they asked for a different problem.',
      'If you need a new number from them, use ask_stakeholder and wait.',
      'If the recommendation changes, publish the updated files with `riskon publish`.',
      '',
      'Their message:',
      message,
    ].join('\n');
  }

  async trigger(options: TriggerRunOptions): Promise<TriggerRunResult> {
    const prompt = this.buildPrompt(options);
    let agent: SDKAgent | undefined;
    let cursorRunId: string | null = null;

    try {
      agent = await Agent.create(this.agentOptions(options));
      return await this.executeTurn(agent, prompt, options);
    } catch (error) {
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

  async continue(options: ContinueRunOptions): Promise<TriggerRunResult> {
    const prompt = this.buildFollowUpPrompt(options.message);
    let agent: SDKAgent | undefined;
    let cursorRunId: string | null = null;

    try {
      agent = await Agent.resume(options.cursorAgentId, this.resumeOptions(options));
      return await this.executeTurn(agent, prompt, options);
    } catch (error) {
      if (error instanceof CursorAgentError) {
        this.logger.error(
          `Run ${options.runId} could not continue: ${error.message}`,
        );
        return {
          cursorAgentId: options.cursorAgentId,
          cursorRunId,
          status: 'error',
          result: null,
          errorMessage: `Could not continue this session: ${error.message}`,
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

  private async executeTurn(
    agent: SDKAgent,
    prompt: string,
    options: TriggerRunOptions | ContinueRunOptions,
  ): Promise<TriggerRunResult> {
    const run = await agent.send(prompt);
    const cursorRunId = run.id;
    this.logger.log(
      `Run ${options.runId} -> agent ${agent.agentId}, cursor run ${run.id}`,
    );
    await options.onAgentStarted({
      cursorAgentId: agent.agentId,
      cursorRunId: run.id,
    });

    const progress: TurnProgress = { streamed: 0, backfilled: 0 };
    const streamed = this.streamEvents(run, options, progress);
    const result = await this.settle(run, agent.agentId, options, progress);
    await streamed;

    if (progress.streamed === 0) {
      await this.backfillTimeline(run, options, progress);
    }

    const artifactCount = await this.collectArtifacts(agent, options);

    return {
      cursorAgentId: agent.agentId,
      cursorRunId,
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
  }

  /**
   * Forward live events, tolerating a stream that dies before the run does.
   *
   * Losing the stream costs the stakeholder a live timeline, which is a
   * degraded page rather than a failed run, so it is never allowed to reject.
   */
  private async streamEvents(
    run: Run,
    options: TriggerRunOptions | ContinueRunOptions,
    progress: TurnProgress,
  ): Promise<void> {
    if (!run.supports('stream')) {
      this.logger.warn(
        `Run ${options.runId} cannot stream: ${run.unsupportedReason('stream')}`,
      );
      return;
    }

    try {
      for await (const event of run.stream()) {
        progress.streamed += 1;
        await options.onEvent(event);
      }
    } catch (error) {
      this.logger.warn(
        `Run ${options.runId} stream ended early after ${progress.streamed} event(s): ${String(error)}`,
      );
    }
  }

  /**
   * The run's real outcome, which is not always what `wait()` says.
   *
   * `wait()` watches the event stream, so when the stream expires it reports a
   * failure for a run that is still going. Believing it strands a live agent:
   * the stakeholder is shown an error, the run stops being followed, and the
   * answer the agent goes on to publish never arrives. So a stream-shaped
   * failure is treated as a lost connection and the API is asked directly.
   */
  private async settle(
    run: Run,
    agentId: string,
    options: TriggerRunOptions | ContinueRunOptions,
    progress: TurnProgress,
  ): Promise<RunResult> {
    let reported: RunResult | null = null;

    try {
      reported = await run.wait();
      if (!LOST_STREAM.test(reported.error?.message ?? '')) {
        return reported;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!LOST_STREAM.test(message)) throw error;
    }

    this.logger.warn(
      `Run ${options.runId} lost the event stream for ${run.id}; asking the API for its real outcome`,
    );

    const confirmed =
      options.runtime === 'cloud'
        ? await this.pollUntilSettled(run, agentId, options, progress)
        : null;

    return (
      confirmed ??
      reported ?? {
        id: run.id,
        status: 'error',
        error: {
          message:
            'the event stream ended and the run could not be reached to confirm how it went',
        },
      }
    );
  }

  /**
   * Ask Cursor what a run is doing until it is no longer running.
   *
   * A fresh handle per poll is deliberate: the stale one is the thing whose
   * stream just died.
   */
  private async pollUntilSettled(
    run: Run,
    agentId: string,
    options: TriggerRunOptions | ContinueRunOptions,
    progress: TurnProgress,
  ): Promise<RunResult | null> {
    const deadline = Date.now() + this.config.runPollTimeoutSeconds * 1000;

    while (Date.now() < deadline) {
      await delay(this.config.runPollSeconds * 1000);

      let fresh: Run;
      try {
        fresh = await Agent.getRun(run.id, {
          runtime: 'cloud',
          agentId,
          apiKey: this.config.cursorApiKey,
        });
      } catch (error) {
        this.logger.warn(
          `Run ${options.runId} could not be polled: ${String(error)}`,
        );
        continue;
      }

      // With no stream, the transcript is the only thing the stakeholder can
      // watch, so it is pulled as the run goes rather than only at the end.
      if (progress.streamed === 0) {
        await this.backfillTimeline(fresh, options, progress);
      }

      if (fresh.status !== 'running') {
        this.logger.log(
          `Run ${options.runId} really ended as ${fresh.status} after its stream was lost`,
        );
        return {
          id: fresh.id,
          status: fresh.status,
          result: fresh.result,
          error: fresh.error,
          model: fresh.model,
          durationMs: fresh.durationMs,
          git: fresh.git,
          usage: fresh.usage,
        };
      }
    }

    this.logger.warn(
      `Run ${options.runId} was still running when polling gave up after ` +
        `${this.config.runPollTimeoutSeconds}s`,
    );
    return null;
  }

  /**
   * Mirror the durable transcript into the timeline.
   *
   * Cloud streams are only retained for a window after the run starts, so a
   * long run can outlive its own stream. `conversation()` is the durable copy.
   * Only turns that can no longer grow are written, because a turn read while
   * the run is mid-way through it would be written again, longer, next time.
   */
  private async backfillTimeline(
    run: Run,
    options: TriggerRunOptions | ContinueRunOptions,
    progress: TurnProgress,
  ): Promise<void> {
    if (!run.supports('conversation')) return;

    try {
      const turns = await run.conversation();
      const complete =
        run.status === 'running' ? Math.max(turns.length - 1, 0) : turns.length;
      if (complete <= progress.backfilled) return;

      for (const turn of turns.slice(progress.backfilled, complete)) {
        await options.onTranscriptTurn(turn);
      }
      this.logger.log(
        `Run ${options.runId} timeline backfilled to ${complete} turn(s)`,
      );
      progress.backfilled = complete;
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

  /** Resume keeps the same VM; MCP servers are in-memory and must be passed again. */
  private resumeOptions(options: ContinueRunOptions): AgentOptions {
    const base: AgentOptions = {
      apiKey: this.config.cursorApiKey,
      model: { id: this.config.cursorModel },
    };

    if (options.runtime === 'local') {
      const cwd = this.config.localAgentPath;
      if (!cwd) {
        throw new CursorAgentError(
          'RISKON_AGENT_PATH is not set, so there is no local checkout to resume in.',
        );
      }
      return { ...base, local: { cwd, settingSources: [] } };
    }

    return {
      ...base,
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
    options: TriggerRunOptions | ContinueRunOptions,
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
