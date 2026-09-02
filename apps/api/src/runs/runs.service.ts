import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import type { ConversationTurn } from '@cursor/sdk';
import type {
  AgentRunSummary,
  CreateRunRequest,
  RunEventPayload,
} from '@riskon/shared';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { CursorAgentService } from '../cursor/cursor-agent.service.js';
import { timelineEventsFromTurn } from '../cursor/conversation-turn.js';
import { EventsGateway } from '../events/events.gateway.js';
import { RunTimelineService } from '../timeline/run-timeline.service.js';
import { RunQuestionsService } from '../questions/run-questions.service.js';
import { RunArtifactsService } from './run-artifacts.service.js';
import { DatasetsService } from '../datasets/datasets.service.js';
import { AppConfig } from '../config/app-config.js';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    @InjectRepository(AgentRun)
    private readonly runs: Repository<AgentRun>,
    private readonly cursorAgent: CursorAgentService,
    private readonly gateway: EventsGateway,
    private readonly timeline: RunTimelineService,
    private readonly questions: RunQuestionsService,
    private readonly artifacts: RunArtifactsService,
    private readonly datasets: DatasetsService,
    private readonly config: AppConfig,
  ) {}

  async create(dto: CreateRunRequest): Promise<AgentRunSummary> {
    // Uploaded files win over a pasted URL: they are what the stakeholder
    // just chose, and they are already reachable by the agent.
    const datasetIds = uniqueIds([
      ...(dto.datasetIds ?? []),
      ...(dto.datasetId ? [dto.datasetId] : []),
    ]);
    const attached = await this.datasets.findMany(datasetIds);
    const dataFiles = attached.map((dataset) => ({
      filename: dataset.filename,
      url: this.datasets.downloadUrl(dataset.id),
    }));
    const dataSource = dataFiles[0]?.url ?? dto.dataSource ?? null;

    const runtime = dto.runtime ?? 'cloud';
    const saved = await this.runs.save(
      this.runs.create({
        title: dto.title,
        businessQuestion: dto.businessQuestion,
        dataSource,
        datasetId: datasetIds[0] ?? null,
        datasetIds: datasetIds.length > 0 ? datasetIds : null,
        template: dto.template ?? null,
        runtime,
        repositoryUrl: dto.repositoryUrl ?? this.config.agentRepositoryUrl,
        status: 'pending',
        mcpToken: randomBytes(24).toString('hex'),
      }),
    );

    // Fire and forget: the caller gets the run id straight away and follows the
    // rest over the socket. Rejections are handled inside executeRun.
    void this.executeRun(saved.id, dataFiles);

    return this.toSummary(saved, 0);
  }

  async findAll(): Promise<AgentRunSummary[]> {
    const runs = await this.runs.find({ order: { createdAt: 'DESC' } });
    return Promise.all(
      runs.map(async (run) =>
        this.toSummary(run, await this.artifacts.countForRun(run.id)),
      ),
    );
  }

  async findOne(id: string): Promise<AgentRunSummary> {
    const run = await this.findEntity(id);
    return this.toSummary(run, await this.artifacts.countForRun(id));
  }

  async listEvents(id: string): Promise<RunEventPayload[]> {
    await this.findEntity(id);
    return this.timeline.list(id);
  }

  async continue(id: string, message: string): Promise<AgentRunSummary> {
    const run = await this.findEntity(id);
    if (
      run.status === 'pending' ||
      run.status === 'running' ||
      run.status === 'awaiting_input'
    ) {
      throw new ConflictException(
        'This run is still working. Wait for it to finish, or answer the question first.',
      );
    }
    if (!run.cursorAgentId) {
      throw new BadRequestException(
        'This session cannot be continued. Start a new one.',
      );
    }

    await this.timeline.append(id, 'user', { text: message });
    await this.setStatus(id, 'running');
    void this.executeFollowUp(id, message);

    const fresh = await this.findEntity(id);
    return this.toSummary(fresh, await this.artifacts.countForRun(id));
  }

  async findEntity(id: string): Promise<AgentRun> {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException(`Run ${id} not found`);
    }
    return run;
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  private async executeRun(
    runId: string,
    dataFiles: { filename: string; url: string }[],
  ): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) {
      return;
    }

    await this.setStatus(runId, 'running');

    if (run.runtime === 'cloud' && !this.config.isPubliclyReachable) {
      await this.timeline.append(runId, 'agent_notice', {
        message:
          'This API is not reachable from the internet, so the agent cannot fetch the uploaded ' +
          'data or ask you questions. It will fall back to its own assumptions. Expose the API ' +
          '(npm run tunnel) and set PUBLIC_BASE_URL to fix this.',
      });
    }

    try {
      const outcome = await this.cursorAgent.trigger({
        runId,
        title: run.title,
        businessQuestion: run.businessQuestion,
        dataSource: run.dataSource,
        dataFilename: dataFiles[0]?.filename ?? null,
        dataFiles,
        template: run.template,
        runtime: run.runtime,
        repositoryUrl: run.repositoryUrl,
        startingRef: null,
        mcpToken: run.mcpToken ?? '',

        onAgentStarted: async ({ cursorAgentId, cursorRunId }) => {
          await this.runs.update(runId, { cursorAgentId, cursorRunId });
        },

        onEvent: async (event) => {
          await this.timeline.append(runId, event.type, event);
        },

        onTranscriptTurn: async (turn) => {
          await this.appendTranscriptTurn(runId, turn);
        },

        onArtifact: async (artifact, body) => {
          const path = CursorAgentService.relativeArtifactPath(artifact.path);
          const stored = await this.artifacts.store(runId, path, body);
          this.gateway.emitArtifact(runId, stored);
        },
      });

      // The agent is gone; anything still pending will never be read.
      await this.questions.cancelPending(runId, 'the run ended');

      await this.runs.update(runId, {
        cursorAgentId: outcome.cursorAgentId,
        cursorRunId: outcome.cursorRunId,
        status: outcome.status,
        result: outcome.result,
        errorMessage: outcome.errorMessage,
        completedAt: new Date(),
      });

      this.gateway.emitRunUpdated(runId, {
        status: outcome.status,
        result: outcome.result,
        errorMessage: outcome.errorMessage,
        artifactCount: outcome.artifactCount,
      });

      if (outcome.status === 'finished' && outcome.artifactCount === 0) {
        await this.timeline.append(runId, 'agent_notice', {
          message:
            'The agent finished but published no files. Its answer is in the summary above; ' +
            'there is nothing to download.',
        });
      }
    } catch (error) {
      // Anything reaching here is a bug on our side rather than a failed run,
      // so it is logged in full and reduced to one sentence for the run row.
      this.logger.error(`Run ${runId} crashed`, error as Error);
      await this.questions.cancelPending(runId, 'the run crashed');
      await this.runs.update(runId, {
        status: 'error',
        errorMessage:
          'Something went wrong on our side while running this. The timeline shows how far it got.',
        completedAt: new Date(),
      });
      this.gateway.emitRunUpdated(runId, {
        status: 'error',
        errorMessage:
          'Something went wrong on our side while running this. The timeline shows how far it got.',
      });
    }
  }

  private async executeFollowUp(runId: string, message: string): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run?.cursorAgentId) {
      return;
    }

    try {
      const outcome = await this.cursorAgent.continue({
        runId,
        title: run.title,
        cursorAgentId: run.cursorAgentId,
        message,
        runtime: run.runtime,
        repositoryUrl: run.repositoryUrl,
        startingRef: null,
        mcpToken: run.mcpToken ?? '',

        onAgentStarted: async ({ cursorAgentId, cursorRunId }) => {
          await this.runs.update(runId, { cursorAgentId, cursorRunId });
        },

        onEvent: async (event) => {
          await this.timeline.append(runId, event.type, event);
        },

        onTranscriptTurn: async (turn) => {
          await this.appendTranscriptTurn(runId, turn);
        },

        onArtifact: async (artifact, body) => {
          const path = CursorAgentService.relativeArtifactPath(artifact.path);
          const stored = await this.artifacts.store(runId, path, body);
          this.gateway.emitArtifact(runId, stored);
        },
      });

      await this.questions.cancelPending(runId, 'the run ended');

      await this.runs.update(runId, {
        cursorAgentId: outcome.cursorAgentId,
        cursorRunId: outcome.cursorRunId,
        status: outcome.status,
        result: outcome.result ?? run.result,
        errorMessage: outcome.errorMessage,
        completedAt: new Date(),
      });

      this.gateway.emitRunUpdated(runId, {
        status: outcome.status,
        result: outcome.result ?? run.result,
        errorMessage: outcome.errorMessage,
        artifactCount: outcome.artifactCount,
      });
    } catch (error) {
      this.logger.error(`Follow-up on run ${runId} crashed`, error as Error);
      await this.questions.cancelPending(runId, 'the run crashed');
      await this.runs.update(runId, {
        status: 'error',
        errorMessage:
          'Something went wrong on our side while continuing this. The earlier answer is still here.',
        completedAt: new Date(),
      });
      this.gateway.emitRunUpdated(runId, {
        status: 'error',
        errorMessage:
          'Something went wrong on our side while continuing this. The earlier answer is still here.',
      });
    }
  }

  private async appendTranscriptTurn(
    runId: string,
    turn: ConversationTurn,
  ): Promise<void> {
    for (const event of timelineEventsFromTurn(turn)) {
      await this.timeline.append(runId, event.eventType, event.payload);
    }
  }

  private async setStatus(
    runId: string,
    status: AgentRunSummary['status'],
  ): Promise<void> {
    await this.runs.update(runId, { status });
    this.gateway.emitRunUpdated(runId, { status });
  }

  private toSummary(run: AgentRun, artifactCount: number): AgentRunSummary {
    return {
      id: run.id,
      title: run.title,
      status: run.status,
      businessQuestion: run.businessQuestion,
      dataSource: run.dataSource,
      datasetId: run.datasetId,
      datasetIds: run.datasetIds?.length
        ? run.datasetIds
        : run.datasetId
          ? [run.datasetId]
          : [],
      template: run.template,
      runtime: run.runtime,
      repositoryUrl: run.repositoryUrl,
      cursorAgentId: run.cursorAgentId,
      cursorRunId: run.cursorRunId,
      result: run.result,
      errorMessage: run.errorMessage,
      artifactCount,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
