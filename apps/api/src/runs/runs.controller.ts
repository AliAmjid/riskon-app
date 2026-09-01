import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import type { AgentRunSummary, RunEventPayload } from '@riskon/shared';
import { RunsService } from './runs.service.js';
import { CreateRunDto } from './dto/create-run.dto.js';

@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateRunDto,
  ): Promise<AgentRunSummary> {
    return this.runsService.create(dto);
  }

  @Get()
  findAll(): Promise<AgentRunSummary[]> {
    return this.runsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AgentRunSummary> {
    return this.runsService.findOne(id);
  }

  @Get(':id/events')
  listEvents(@Param('id') id: string): Promise<RunEventPayload[]> {
    return this.runsService.listEvents(id);
  }
}
