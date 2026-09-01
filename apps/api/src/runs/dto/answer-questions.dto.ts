import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import type { AnswerQuestionsRequest } from '@riskon/shared';

export class AnswerQuestionsDto implements AnswerQuestionsRequest {
  /**
   * Keyed by question id. Values are free-form strings — the agent asked for a
   * budget or a grade, not for a typed schema, and it reads them back as text.
   */
  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  /** The "you decide" exit. */
  @IsOptional()
  @IsBoolean()
  decline?: boolean;
}
