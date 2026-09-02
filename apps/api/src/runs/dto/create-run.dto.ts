import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AgentRuntime, CreateRunRequest } from '@riskon/shared';

export class CreateRunDto implements CreateRunRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(10)
  businessQuestion!: string;

  @IsOptional()
  @IsUUID()
  datasetId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  datasetIds?: string[];

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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  startingRef?: string;
}
