import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunsModule } from './runs/runs.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { DatasetsModule } from './datasets/datasets.module.js';
import { EventsModule } from './events/events.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TimelineModule } from './timeline/timeline.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { AgentRun } from './database/entities/agent-run.entity.js';
import { RunEvent } from './database/entities/run-event.entity.js';
import { RunArtifact } from './database/entities/run-artifact.entity.js';
import { RunQuestionRound } from './database/entities/run-question.entity.js';
import { Dataset } from './database/entities/dataset.entity.js';
import { HealthController } from './health.controller.js';

const ENTITIES = [AgentRun, RunEvent, RunArtifact, RunQuestionRound, Dataset];

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: ENTITIES,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    StorageModule,
    EventsModule,
    TimelineModule,
    QuestionsModule,
    DatasetsModule,
    RunsModule,
    McpModule,
  ],
})
export class AppModule {}
