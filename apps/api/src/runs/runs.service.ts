import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import type {
  AgentRunSummary,
  CreateRunRequest,
  RunEventPayload,
} from '@riskon/shared';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { CursorAgentService } from '../cursor/cursor-agent.service.js';
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
    // An uploaded dataset wins over a pasted URL: it is the thing the
    // stakeholder just chose, and it is already reachable by the agent.
    let dataSource = dto.dataSource ?? null;
    let dataFilename: string | null = null;
    if (dto.datasetId) {
      const dataset = await this.datasets.findOne(dto.datasetId);
      dataSource = this.datasets.downloadUrl(dataset.id);
      dataFilename = dataset.filename;
    }

    const runtime = dto.runtime ?? 'cloud';
    const saved = await this.runs.save(
      this.runs.create({
        title: dto.title,
        businessQuestion: dto.businessQuestion,
        dataSource,
        datasetId: dto.datasetId ?? null,
        template: dto.template ?? null,
        runtime,
        repositoryUrl: dto.repositoryUrl ?? this.config.agentRepositoryUrl,
        status: 'pending',
        mcpToken: randomBytes(24).toString('hex'),
      }),
    );

    // Fire and forget: the caller gets the run id straight away and follows the
    // rest over the socket. Rejections are handled inside executeRun.
    void this.executeRun(saved.id, dataFilename);

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
    dataFilename: string | null,
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
        dataFilename,
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
          await this.timeline.append(runId, turn.type, turn);
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
