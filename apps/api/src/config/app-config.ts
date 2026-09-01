import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';

const DEFAULT_AGENT_REPOSITORY = 'https://github.com/AliAmjid/cursor-agent';

/**
 * Every environment lookup in one place, so a missing variable fails at
 * startup with a sentence rather than at 3am inside a run.
 */
@Injectable()
export class AppConfig {
  private readonly logger = new Logger(AppConfig.name);

  constructor(private readonly config: ConfigService) {}

  get cursorApiKey(): string {
    return this.config.getOrThrow<string>('CURSOR_API_KEY');
  }

  get cursorModel(): string {
    return this.config.get<string>('CURSOR_MODEL', 'composer-2.5');
  }

  get agentRepositoryUrl(): string {
    return this.config.get<string>(
      'AGENT_REPOSITORY_URL',
      DEFAULT_AGENT_REPOSITORY,
    );
  }

  get agentRepositoryRef(): string {
    return this.config.get<string>('AGENT_REPOSITORY_REF', 'main');
  }

  /** Only used by the `local` runtime, which cannot produce artifacts. */
  get localAgentPath(): string | undefined {
    return this.config.get<string>('RISKON_AGENT_PATH');
  }

  get storageRoot(): string {
    return resolve(this.config.get<string>('STORAGE_ROOT', './storage'));
  }

  /**
   * The origin a cloud agent uses to reach us: dataset downloads and the MCP
   * question channel. Must be publicly resolvable, so in development this is
   * an ngrok URL rather than localhost.
   */
  get publicBaseUrl(): string {
    const raw = this.config.get<string>('PUBLIC_BASE_URL');
    if (!raw) {
      return `http://localhost:${this.port}`;
    }
    return raw.replace(/\/+$/, '');
  }

  /**
   * Whether the public base URL can actually be reached from a cloud VM. When
   * it cannot, we still run — the agent just loses uploaded datasets and the
   * ability to ask questions — but we say so loudly instead of failing oddly
   * halfway through.
   */
  get isPubliclyReachable(): boolean {
    const url = this.publicBaseUrl;
    return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/i.test(
      url,
    );
  }

  get port(): number {
    return Number(this.config.get<string>('PORT', '3000'));
  }

  /**
   * How long a single `ask_stakeholder` / `await_answers` call blocks before
   * returning `pending`. Kept well under any proxy idle timeout: the agent
   * simply calls again, which is cheaper than a dropped connection.
   */
  get questionPollSeconds(): number {
    return Number(this.config.get<string>('QUESTION_POLL_SECONDS', '90'));
  }

  /** How long a question round stays open before it becomes a `timeout`. */
  get questionTimeoutSeconds(): number {
    return Number(this.config.get<string>('QUESTION_TIMEOUT_SECONDS', '1800'));
  }

  get maxUploadBytes(): number {
    return Number(this.config.get<string>('MAX_UPLOAD_BYTES', String(64 * 1024 * 1024)));
  }

  /**
   * A fixed token that resolves to the newest run, so a developer can point
   * their own MCP client at this API and exercise the stakeholder tools by
   * hand. Per-run tokens are the real credential; this exists because a static
   * config file cannot hold a token that is minted per run.
   *
   * Ignored in production: anyone holding it could ask and answer questions on
   * a run that is not theirs.
   */
  get devMcpToken(): string | undefined {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return undefined;
    }
    return this.config.get<string>('RISKON_DEV_MCP_TOKEN') || undefined;
  }

  warnAboutReachability(): void {
    if (this.isPubliclyReachable) {
      this.logger.log(`Public base URL: ${this.publicBaseUrl}`);
      return;
    }
    this.logger.warn(
      `PUBLIC_BASE_URL is ${this.publicBaseUrl}, which a Cursor cloud agent cannot reach. ` +
        'Uploaded datasets and stakeholder questions will not work until you expose this API ' +
        '(npm run tunnel) and set PUBLIC_BASE_URL to the public origin.',
    );
  }
}
