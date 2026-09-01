import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  AgentRunSummary,
  RunArtifactSummary,
  RunEventPayload,
  RunQuestionRequest,
} from '@riskon/shared';
import { RunsService } from './runs.service.js';
import { RunArtifactsService } from './run-artifacts.service.js';
import { RunQuestionsService } from '../questions/run-questions.service.js';
import { CreateRunDto } from './dto/create-run.dto.js';
import { AnswerQuestionsDto } from './dto/answer-questions.dto.js';

@Controller('runs')
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly artifacts: RunArtifactsService,
    private readonly questions: RunQuestionsService,
  ) {}

  @Post()
  create(@Body() dto: CreateRunDto): Promise<AgentRunSummary> {
    return this.runs.create(dto);
  }

  @Get()
  findAll(): Promise<AgentRunSummary[]> {
    return this.runs.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AgentRunSummary> {
    return this.runs.findOne(id);
  }

  @Get(':id/events')
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunEventPayload[]> {
    return this.runs.listEvents(id);
  }

  // -------------------------------------------------------------------------
  // Artifacts
  // -------------------------------------------------------------------------

  @Get(':id/artifacts')
  async listArtifacts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunArtifactSummary[]> {
    await this.runs.findEntity(id);
    return this.artifacts.listForRun(id);
  }

  @Get(':id/artifacts/:artifactId/preview')
  async previewArtifact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
  ): Promise<{ path: string; contentType: string; text: string | null }> {
    await this.runs.findEntity(id);
    return this.artifacts.preview(id, artifactId);
  }

  @Get(':id/artifacts/:artifactId/raw')
  async downloadArtifact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.runs.findEntity(id);
    const { artifact, stream } = await this.artifacts.open(id, artifactId);
    res.setHeader('Content-Type', artifact.contentType);
    res.setHeader('Content-Length', artifact.sizeBytes);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(artifact.path)}"`,
    );
    stream.pipe(res);
  }

  // -------------------------------------------------------------------------
  // Questions
  // -------------------------------------------------------------------------

  @Get(':id/questions')
  async listQuestions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunQuestionRequest[]> {
    await this.runs.findEntity(id);
    return this.questions.listForRun(id);
  }

  @Post(':id/questions/:requestId/answer')
  async answerQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: AnswerQuestionsDto,
  ): Promise<RunQuestionRequest> {
    await this.runs.findEntity(id);
    return this.questions.answer(id, requestId, dto);
  }
}
