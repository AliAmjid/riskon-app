import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { TimelineModule } from '../timeline/timeline.module.js';
import { DatasetsModule } from '../datasets/datasets.module.js';
import { McpController } from './mcp.controller.js';
import { RiskonMcpServerFactory } from './riskon-mcp.server.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun]),
    QuestionsModule,
    TimelineModule,
    DatasetsModule,
  ],
  controllers: [McpController],
  providers: [RiskonMcpServerFactory],
})
export class McpModule {}
