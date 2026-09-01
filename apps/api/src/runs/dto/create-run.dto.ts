import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import type { AgentRuntime } from '@riskon/shared';

export class CreateRunDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(10)
  businessQuestion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  dataSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  template?: string;

  @IsOptional()
  @IsIn(['local', 'cloud'])
  runtime?: AgentRuntime;

  @IsOptional()
  @IsUrl()
  repositoryUrl?: string;
}
