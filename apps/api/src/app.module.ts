import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunsModule } from './runs/runs.module.js';
import { AgentRun } from './database/entities/agent-run.entity.js';
import { RunEvent } from './database/entities/run-event.entity.js';
import { Artifact } from './database/entities/artifact.entity.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [AgentRun, RunEvent, Artifact],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    RunsModule,
  ],
})
export class AppModule {}
