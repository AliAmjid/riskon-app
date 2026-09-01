import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AgentRunSummary,
  CreateRunRequest,
  RunEventPayload,
} from '@riskon/shared';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { RunEvent } from '../database/entities/run-event.entity.js';
import { CursorAgentService } from '../cursor/cursor-agent.service.js';
import { EventsGateway } from '../events/events.gateway.js';

@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(AgentRun)
    private readonly runsRepo: Repository<AgentRun>,
    @InjectRepository(RunEvent)
    private readonly eventsRepo: Repository<RunEvent>,
    private readonly cursorAgent: CursorAgentService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(dto: CreateRunRequest): Promise<AgentRunSummary> {
    const run = this.runsRepo.create({
      title: dto.title,
      businessQuestion: dto.businessQuestion,
      dataSource: dto.dataSource ?? null,
      template: dto.template ?? null,
      runtime: dto.runtime ?? 'local',
      status: 'pending',
    });
    const saved = await this.runsRepo.save(run);
    void this.executeRun(saved.id, dto.repositoryUrl ?? null);
    return this.toSummary(saved);
  }

  async findAll(): Promise<AgentRunSummary[]> {
    const runs = await this.runsRepo.find({ order: { createdAt: 'DESC' } });
    return runs.map((run) => this.toSummary(run));
  }

  async findOne(id: string): Promise<AgentRunSummary> {
    const run = await this.runsRepo.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException(`Run ${id} not found`);
    }
    return this.toSummary(run);
  }

  async listEvents(id: string): Promise<RunEventPayload[]> {
    await this.findOne(id);
    const events = await this.eventsRepo.find({
      where: { runId: id },
      order: { createdAt: 'ASC' },
    });
    return events.map((event) => ({
      id: event.id,
      runId: event.runId,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  private async executeRun(
    runId: string,
    repositoryUrl: string | null,
  ): Promise<void> {
    const run = await this.runsRepo.findOne({ where: { id: runId } });
    if (!run) {
      return;
    }

    await this.runsRepo.update(runId, { status: 'running' });
    this.eventsGateway.emitRunUpdated(runId, { status: 'running' });

    const outcome = await this.cursorAgent.trigger({
      businessQuestion: run.businessQuestion,
      dataSource: run.dataSource,
      template: run.template,
      runtime: run.runtime,
      repositoryUrl,
      onEvent: async (event) => {
        const saved = await this.eventsRepo.save(
          this.eventsRepo.create({
            runId,
            eventType: event.type,
            payload: event as unknown as Record<string, unknown>,
          }),
        );
        this.eventsGateway.emitRunEvent(runId, {
          id: saved.id,
          runId,
          eventType: saved.eventType,
          payload: saved.payload,
          createdAt: saved.createdAt.toISOString(),
        });
      },
    });

    await this.runsRepo.update(runId, {
      cursorAgentId: outcome.cursorAgentId,
      cursorRunId: outcome.cursorRunId,
      status: outcome.status,
      result: outcome.result,
      errorMessage: outcome.errorMessage,
      completedAt: new Date(),
    });

    this.eventsGateway.emitRunUpdated(runId, {
      status: outcome.status,
      result: outcome.result,
      errorMessage: outcome.errorMessage,
    });
  }

  private toSummary(run: AgentRun): AgentRunSummary {
    return {
      id: run.id,
      title: run.title,
      status: run.status,
      businessQuestion: run.businessQuestion,
      dataSource: run.dataSource,
      template: run.template,
      runtime: run.runtime,
      cursorAgentId: run.cursorAgentId,
      cursorRunId: run.cursorRunId,
      result: run.result,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }
}
