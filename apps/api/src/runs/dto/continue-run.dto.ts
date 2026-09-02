import { IsString, MaxLength, MinLength } from 'class-validator';
import type { ContinueRunRequest } from '@riskon/shared';

export class ContinueRunDto implements ContinueRunRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  message!: string;
}
