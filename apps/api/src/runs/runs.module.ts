import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { RunArtifact } from '../database/entities/run-artifact.entity.js';
import { CursorAgentService } from '../cursor/cursor-agent.service.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { TimelineModule } from '../timeline/timeline.module.js';
import { DatasetsModule } from '../datasets/datasets.module.js';
import { RunsController } from './runs.controller.js';
import { RunsService } from './runs.service.js';
import { RunArtifactsService } from './run-artifacts.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, RunArtifact]),
    QuestionsModule,
    TimelineModule,
    DatasetsModule,
  ],
  controllers: [RunsController],
  providers: [RunsService, RunArtifactsService, CursorAgentService],
})
export class RunsModule {}
