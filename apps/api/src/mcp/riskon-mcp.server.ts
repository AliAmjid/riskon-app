import { Injectable, Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RunQuestion } from '@riskon/shared';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { RunQuestionsService } from '../questions/run-questions.service.js';
import { RunTimelineService } from '../timeline/run-timeline.service.js';
import { DatasetsService } from '../datasets/datasets.service.js';

/**
 * Tool schemas are written as JSON Schema by hand rather than derived from zod.
 *
 * The high-level `McpServer.registerTool` infers the handler's argument type
 * from the schema, and the question shape here — a bounded array of objects,
 * one field of which is itself an array of objects — is deep enough to exhaust
 * the TypeScript compiler. Declaring the wire schema and validating with zod
 * separately costs a few lines and makes both halves explicit: the agent sees
 * exactly this, and the handler trusts nothing until zod has parsed it.
 */
const QUESTION_JSON_SCHEMA = {
  type: 'object',
  required: ['id', 'question'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      maxLength: 64,
      description:
        'Short slug you will read the answer back by, e.g. "budget" or "case_size".',
    },
    question: {
      type: 'string',
      description:
        'The question, in plain language. No solver vocabulary: "how much can you spend in ' +
        'total?", not "what is the budget constraint\'s right-hand side?".',
    },
    why_it_matters: {
      type: 'string',
      description:
        'What moves if the answer moves. Shown under the question, so the stakeholder can see ' +
        'why you are asking.',
    },
    recommended: {
      type: 'string',
      description:
        'The answer they can accept with one word. Strongly encouraged: it is what makes the ' +
        'round answerable in seconds rather than abandoned.',
    },
    unit: {
      type: 'string',
      description:
        'Unit shown beside a free-text answer, e.g. "USD", "carats", "settings".',
    },
    options: {
      type: 'array',
      description:
        'Offer choices whenever the answer is one of a few things. A non-technical stakeholder ' +
        'picks "option B" far more readily than they fill in a blank field.',
      items: {
        type: 'object',
        required: ['value', 'label'],
        additionalProperties: false,
        properties: {
          value: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
} as const;

const optionSchema = z.object({ value: z.string(), label: z.string() });

const questionSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().min(1),
  why_it_matters: z.string().optional(),
  recommended: z.string().optional(),
  unit: z.string().optional(),
  options: z.array(optionSchema).optional(),
});

const askArgsSchema = z.object({
  intro: z.string().optional(),
  questions: z.array(questionSchema).min(1).max(6),
});

const awaitArgsSchema = z.object({ request_id: z.string().min(1) });

const notifyArgsSchema = z.object({ message: z.string().min(1).max(2000) });

const TOOLS: Tool[] = [
  {
    name: 'ask_stakeholder',
    title: 'Ask the stakeholder',
    description:
      'Send one round of questions to the person who triggered this run and wait for the answer. ' +
      'This is the only channel that reaches them: nobody is reading your transcript.\n\n' +
      'Send the whole round in a single call — at most six questions — and give every question a ' +
      'recommended answer they can accept with one word.\n\n' +
      'Returns { request_id, status, answers, guidance }. status is one of:\n' +
      '  answered  — the answers are facts; log each one CONFIRMED.\n' +
      '  declined  — they chose "you decide"; proceed on your recommendations and log DECLINED.\n' +
      '  timeout   — nobody was there; proceed on your recommendations and log GUESSED.\n' +
      '  pending   — still open, nobody has answered yet. The wait simply ran out of time. Call ' +
      'await_answers with the request_id and keep waiting; do not start modelling.',
    inputSchema: {
      type: 'object',
      required: ['questions'],
      additionalProperties: false,
      properties: {
        intro: {
          type: 'string',
          description:
            'One or two sentences framing the round, shown above the questions.',
        },
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: QUESTION_JSON_SCHEMA,
        },
      },
    },
  },
  {
    name: 'await_answers',
    title: 'Keep waiting for answers',
    description:
      'Continue waiting on a round that came back "pending". Same return shape as ' +
      'ask_stakeholder. Repeat until the status is terminal.',
    inputSchema: {
      type: 'object',
      required: ['request_id'],
      additionalProperties: false,
      properties: {
        request_id: {
          type: 'string',
          description: 'The request_id returned by ask_stakeholder.',
        },
      },
    },
  },
  {
    name: 'notify_stakeholder',
    title: 'Send a progress note',
    description:
      'One-way progress note. Does not block and cannot be answered. Use it when you are about ' +
      'to start something slow, or when the data changed the shape of the question. Never use it ' +
      'to ask for something — that is ask_stakeholder.',
    inputSchema: {
      type: 'object',
      required: ['message'],
      additionalProperties: false,
      properties: {
        message: {
          type: 'string',
          maxLength: 2000,
          description: 'Plain language, no solver vocabulary.',
        },
      },
    },
  },
  {
    name: 'get_run_context',
    title: 'Re-read the brief',
    description:
      'The business question and the data for this run, as the stakeholder submitted them. Use ' +
      'it to confirm the brief rather than reconstructing it from the conversation.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const INSTRUCTIONS =
  'The channel to the person who triggered this run. Use ask_stakeholder for anything that ' +
  'changes the recommendation — a budget, a cap, a deadline, a price, or which objective wins ' +
  'when the brief names two. Writing questions into your transcript reaches nobody.';

/**
 * Builds the per-run MCP server handed to a cloud agent.
 *
 * A fresh instance is created per HTTP request (the transport is stateless),
 * but each one closes over the single run its token resolved to. An agent
 * therefore cannot reach another run's stakeholder, whatever it passes.
 */
@Injectable()
export class RiskonMcpServerFactory {
  private readonly logger = new Logger(RiskonMcpServerFactory.name);

  constructor(
    private readonly questions: RunQuestionsService,
    private readonly timeline: RunTimelineService,
    private readonly datasets: DatasetsService,
  ) {}

  create(run: AgentRun): Server {
    const server = new Server(
      { name: 'riskon', version: '1.0.0' },
      { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        return await this.dispatch(run, name, args ?? {});
      } catch (error) {
        this.logger.error(
          `Tool ${name} failed for run ${run.id}: ${String(error)}`,
        );
        // Reported as a tool error rather than a protocol error so the agent
        // sees the reason and can adapt, instead of losing the channel.
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `${name} failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });

    return server;
  }

  private async dispatch(
    run: AgentRun,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    switch (name) {
      case 'ask_stakeholder': {
        const { intro, questions } = askArgsSchema.parse(args);
        const outcome = await this.questions.ask(
          run.id,
          intro ?? null,
          questions.map(toRunQuestion),
        );
        return json({
          request_id: outcome.requestId,
          status: outcome.status,
          answers: outcome.answers,
          guidance: outcome.guidance,
        });
      }

      case 'await_answers': {
        const { request_id } = awaitArgsSchema.parse(args);
        const outcome = await this.questions.await(run.id, request_id);
        return json({
          request_id: outcome.requestId,
          status: outcome.status,
          answers: outcome.answers,
          guidance: outcome.guidance,
        });
      }

      case 'notify_stakeholder': {
        const { message } = notifyArgsSchema.parse(args);
        await this.timeline.append(run.id, 'agent_notice', { message });
        this.logger.log(`Run ${run.id} notice: ${message.slice(0, 120)}`);
        return json({ delivered: true });
      }

      case 'get_run_context': {
        const dataset = run.datasetId
          ? await this.datasets.findOne(run.datasetId).catch(() => null)
          : null;
        return json({
          title: run.title,
          business_question: run.businessQuestion,
          data_url: run.dataSource,
          data_filename: dataset?.filename ?? null,
          approx_rows: dataset?.rowCountEstimate ?? null,
          preferred_template: run.template,
          load_hint: run.dataSource
            ? `riskon load "${run.dataSource}"`
            : 'No data was attached. Ask the stakeholder which dataset to use.',
        });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

function toRunQuestion(raw: z.infer<typeof questionSchema>): RunQuestion {
  return {
    id: raw.id,
    question: raw.question,
    whyItMatters: raw.why_it_matters ?? null,
    recommended: raw.recommended ?? null,
    unit: raw.unit ?? null,
    options: raw.options ?? null,
  };
}

/**
 * Tool results are content blocks. JSON in a text block is what agents read
 * most reliably, and it matches the shape promised in the tool description.
 */
function json(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}
