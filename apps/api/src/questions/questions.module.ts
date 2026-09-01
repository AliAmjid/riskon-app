import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { RunQuestionRound } from '../database/entities/run-question.entity.js';
import { RunQuestionsService } from './run-questions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AgentRun, RunQuestionRound])],
  providers: [RunQuestionsService],
  exports: [RunQuestionsService],
})
export class QuestionsModule {}
