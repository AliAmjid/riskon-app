import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunEvent } from '../database/entities/run-event.entity.js';
import { RunTimelineService } from './run-timeline.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RunEvent])],
  providers: [RunTimelineService],
  exports: [RunTimelineService],
})
export class TimelineModule {}
