import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { RunEvent } from '../database/entities/run-event.entity.js';
import { CursorAgentService } from '../cursor/cursor-agent.service.js';
import { EventsGateway } from '../events/events.gateway.js';
import { RunsController } from './runs.controller.js';
import { RunsService } from './runs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AgentRun, RunEvent])],
  controllers: [RunsController],
  providers: [RunsService, CursorAgentService, EventsGateway],
})
export class RunsModule {}
