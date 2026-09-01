import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RunEventPayload } from '@riskon/shared';
import { RunEvent } from '../database/entities/run-event.entity.js';
import { EventsGateway } from '../events/events.gateway.js';

/**
 * The single writer for a run's timeline.
 *
 * Both the Cursor event stream and the agent's own MCP notices land here, so
 * they interleave in one ordered list and reach the browser the same way.
 */
@Injectable()
export class RunTimelineService {
  constructor(
    @InjectRepository(RunEvent)
    private readonly events: Repository<RunEvent>,
    private readonly gateway: EventsGateway,
  ) {}

  async append(
    runId: string,
    eventType: string,
    payload: unknown,
  ): Promise<RunEventPayload> {
    const saved = await this.events.save(
      this.events.create({
        runId,
        eventType,
        payload: payload as Record<string, unknown>,
      }),
    );

    const summary: RunEventPayload = {
      id: saved.id,
      runId,
      eventType: saved.eventType,
      payload: saved.payload,
      createdAt: saved.createdAt.toISOString(),
    };
    this.gateway.emitRunEvent(runId, summary);
    return summary;
  }

  async list(runId: string): Promise<RunEventPayload[]> {
    const rows = await this.events.find({
      where: { runId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      eventType: row.eventType,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
