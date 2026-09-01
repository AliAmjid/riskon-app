import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  AnswerQuestionsRequest,
  QuestionRequestStatus,
  RunQuestion,
  RunQuestionRequest,
} from '@riskon/shared';
import { RunQuestionRound } from '../database/entities/run-question.entity.js';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { EventsGateway } from '../events/events.gateway.js';
import { AppConfig } from '../config/app-config.js';

const TERMINAL: QuestionRequestStatus[] = [
  'answered',
  'declined',
  'timeout',
  'cancelled',
];

/** What the MCP tool hands back to the agent. */
export interface QuestionOutcome {
  requestId: string;
  status: QuestionRequestStatus | 'pending';
  answers: Record<string, string> | null;
  /** A sentence the agent can act on without interpreting the status code. */
  guidance: string;
}

/**
 * The stakeholder question channel.
 *
 * An MCP tool call from inside the agent's VM lands in `ask`, which parks the
 * call until somebody answers in the web UI. The parking is deliberately
 * bounded: each call returns after `questionPollSeconds` whether or not there
 * is an answer, and the agent calls `await` again. Long-lived HTTP through a
 * tunnel is the thing most likely to break, so we never rely on it.
 */
@Injectable()
export class RunQuestionsService {
  private readonly logger = new Logger(RunQuestionsService.name);

  /**
   * Resolvers for calls currently parked, keyed by round id. Purely an
   * optimisation over polling the database — a lost entry (API restart) costs
   * one extra poll cycle, not correctness.
   */
  private readonly waiters = new Map<string, Set<() => void>>();

  constructor(
    @InjectRepository(RunQuestionRound)
    private readonly rounds: Repository<RunQuestionRound>,
    @InjectRepository(AgentRun)
    private readonly runs: Repository<AgentRun>,
    private readonly events: EventsGateway,
    private readonly config: AppConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Agent side
  // -------------------------------------------------------------------------

  /**
   * Open a round and park until it resolves or the poll window closes.
   *
   * Any earlier round still pending for this run is cancelled: the agent asks
   * in one round by design, so a second open round means it moved on and the
   * old one would strand the UI.
   */
  async ask(
    runId: string,
    intro: string | null,
    questions: RunQuestion[],
  ): Promise<QuestionOutcome> {
    if (questions.length === 0) {
      throw new BadRequestException('Send at least one question.');
    }

    await this.cancelPending(runId, 'superseded by a newer round');

    const round = await this.rounds.save(
      this.rounds.create({
        runId,
        status: 'pending',
        intro,
        questions,
        answers: null,
        expiresAt: new Date(
          Date.now() + this.config.questionTimeoutSeconds * 1000,
        ),
      }),
    );

    await this.runs.update(runId, { status: 'awaiting_input' });
    this.events.emitRunUpdated(runId, { status: 'awaiting_input' });
    this.events.emitRunQuestion(runId, this.toPayload(round));
    this.logger.log(
      `Run ${runId} is waiting on ${questions.length} question(s) (round ${round.id})`,
    );

    return this.park(round.id);
  }

  /** Keep waiting on a round the agent already opened. */
  async await(runId: string, requestId: string): Promise<QuestionOutcome> {
    const round = await this.rounds.findOne({ where: { id: requestId, runId } });
    if (!round) {
      throw new NotFoundException(`No question round ${requestId} on this run.`);
    }
    return this.park(round.id);
  }

  /**
   * Park until the round resolves, the poll window closes, or the round expires.
   */
  private async park(roundId: string): Promise<QuestionOutcome> {
    const deadline = Date.now() + this.config.questionPollSeconds * 1000;

    for (;;) {
      const round = await this.rounds.findOneByOrFail({ id: roundId });

      if (TERMINAL.includes(round.status)) {
        return this.outcome(round);
      }

      if (round.expiresAt.getTime() <= Date.now()) {
        return this.outcome(await this.resolve(round, 'timeout', null));
      }

      const remaining = Math.min(
        deadline - Date.now(),
        round.expiresAt.getTime() - Date.now(),
      );
      if (remaining <= 0) {
        return {
          requestId: round.id,
          status: 'pending',
          answers: null,
          guidance:
            'Nobody has answered yet and the round is still open. Do not start modelling. ' +
            `Call await_answers with request_id "${round.id}" to keep waiting.`,
        };
      }

      await this.sleepUntilNotified(roundId, remaining);
    }
  }

  private sleepUntilNotified(roundId: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.waiters.get(roundId)?.delete(finish);
        resolve();
      };

      const timer = setTimeout(finish, ms);
      const set = this.waiters.get(roundId) ?? new Set<() => void>();
      set.add(finish);
      this.waiters.set(roundId, set);
    });
  }

  private wake(roundId: string): void {
    const set = this.waiters.get(roundId);
    if (!set) {
      return;
    }
    this.waiters.delete(roundId);
    for (const notify of set) {
      notify();
    }
  }

  // -------------------------------------------------------------------------
  // Stakeholder side
  // -------------------------------------------------------------------------

  async answer(
    runId: string,
    requestId: string,
    body: AnswerQuestionsRequest,
  ): Promise<RunQuestionRequest> {
    const round = await this.rounds.findOne({ where: { id: requestId, runId } });
    if (!round) {
      throw new NotFoundException(`No question round ${requestId} on this run.`);
    }
    if (TERMINAL.includes(round.status)) {
      throw new BadRequestException(
        `That round is already ${round.status}; the agent has moved on.`,
      );
    }

    if (body.decline) {
      return this.toPayload(await this.resolve(round, 'declined', null));
    }

    const answers = body.answers ?? {};
    const missing = round.questions
      .filter((question) => !String(answers[question.id] ?? '').trim())
      .map((question) => question.id);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Still unanswered: ${missing.join(', ')}. Answer all of them, or choose "you decide".`,
      );
    }

    // Drop anything the agent did not ask about, so a stray field cannot end up
    // in the assumption ledger as a confirmed fact.
    const known = Object.fromEntries(
      round.questions.map((question) => [
        question.id,
        String(answers[question.id]).trim(),
      ]),
    );
    return this.toPayload(await this.resolve(round, 'answered', known));
  }

  async listForRun(runId: string): Promise<RunQuestionRequest[]> {
    const rounds = await this.rounds.find({
      where: { runId },
      order: { createdAt: 'ASC' },
    });
    return rounds.map((round) => this.toPayload(round));
  }

  /**
   * Called when a run ends. A round left pending would otherwise show the
   * stakeholder a question nobody is listening to any more.
   */
  async cancelPending(runId: string, reason: string): Promise<void> {
    const pending = await this.rounds.find({
      where: { runId, status: In(['pending']) },
    });
    for (const round of pending) {
      this.logger.log(`Cancelling round ${round.id}: ${reason}`);
      await this.resolve(round, 'cancelled', null);
    }
  }

  private async resolve(
    round: RunQuestionRound,
    status: QuestionRequestStatus,
    answers: Record<string, string> | null,
  ): Promise<RunQuestionRound> {
    round.status = status;
    round.answers = answers;
    round.resolvedAt = new Date();
    const saved = await this.rounds.save(round);

    // A cancelled round means the run itself is already ending; leave its
    // status alone rather than dragging it back to `running`.
    if (status !== 'cancelled') {
      await this.runs.update(round.runId, { status: 'running' });
      this.events.emitRunUpdated(round.runId, { status: 'running' });
    }
    this.events.emitQuestionResolved(round.runId, this.toPayload(saved));
    this.wake(round.id);
    return saved;
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private outcome(round: RunQuestionRound): QuestionOutcome {
    const guidance: Record<string, string> = {
      answered:
        'The stakeholder answered. These are facts: record each one in the ledger as CONFIRMED, ' +
        'quoting the value they gave.',
      declined:
        'The stakeholder chose "you decide". Proceed on your recommended defaults, record each as ' +
        'DECLINED in the ledger, and say in the recommendation itself that the headline number ' +
        'rests on figures you chose.',
      timeout:
        'Nobody answered in time. Proceed on your recommended defaults, record each as GUESSED in ' +
        'the ledger, and lead "What I had to guess" with the one that moves the answer most.',
      cancelled:
        'This round was cancelled. Do not wait on it; treat the numbers as GUESSED.',
    };

    return {
      requestId: round.id,
      status: round.status,
      answers: round.answers,
      guidance: guidance[round.status] ?? 'Round closed.',
    };
  }

  private toPayload(round: RunQuestionRound): RunQuestionRequest {
    return {
      id: round.id,
      runId: round.runId,
      status: round.status,
      intro: round.intro,
      questions: round.questions,
      answers: round.answers,
      expiresAt: round.expiresAt.toISOString(),
      createdAt: round.createdAt.toISOString(),
      resolvedAt: round.resolvedAt?.toISOString() ?? null,
    };
  }
}
