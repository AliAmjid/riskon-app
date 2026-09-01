import {
  All,
  Controller,
  Logger,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server as McpServerInstance } from '@modelcontextprotocol/sdk/server/index.js';
import { AgentRun } from '../database/entities/agent-run.entity.js';
import { RiskonMcpServerFactory } from './riskon-mcp.server.js';
import { AppConfig } from '../config/app-config.js';

/**
 * The MCP endpoint a Cursor cloud agent connects to.
 *
 * Transport runs stateless — a fresh server and transport per request — because
 * the tunnel between the agent's VM and this process is the least reliable part
 * of the system, and a stateless endpoint has no session to lose when it
 * flickers. The blocking that `ask_stakeholder` needs is bounded inside the
 * tool instead (see RunQuestionsService), not held in transport state.
 *
 * The path token is the credential: it is minted per run, stored on the run
 * row, and is the only thing that maps an incoming tool call to a stakeholder.
 */
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    @InjectRepository(AgentRun)
    private readonly runs: Repository<AgentRun>,
    private readonly factory: RiskonMcpServerFactory,
    private readonly config: AppConfig,
  ) {}

  @All(':token')
  async handle(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const run = await this.resolveRun(token);
    if (!run) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unknown or expired run token.' },
        id: null,
      });
      return;
    }

    const server: McpServerInstance = this.factory.create(run);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(
        `MCP request failed for run ${run.id}: ${String(error)}`,
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  }

  /**
   * A cloud agent presents the token minted for its own run. A developer's own
   * MCP client has no run, so the dev token resolves to the newest one instead
   * — enough to exercise the tools by hand.
   */
  private async resolveRun(token: string): Promise<AgentRun | null> {
    const devToken = this.config.devMcpToken;
    if (devToken && token === devToken) {
      const newest = await this.runs.find({
        order: { createdAt: 'DESC' },
        take: 1,
      });
      if (newest[0]) {
        this.logger.warn(
          `Dev MCP token used; bound to the newest run ${newest[0].id}.`,
        );
      }
      return newest[0] ?? null;
    }
    return this.runs.findOne({ where: { mcpToken: token } });
  }
}
