import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class ArtifactStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.bucket = this.config.get<string>('S3_BUCKET', 'riskon-artifacts');
    this.publicBaseUrl = this.config.get<string>('S3_PUBLIC_URL') ?? null;

    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'minioadmin'),
      },
    });
  }

  storageKey(runId: string, artifactPath: string): string {
    return `agent-runs/${runId}/${artifactPath.replace(/^\/+/, '')}`;
  }

  async upload(runId: string, artifactPath: string, body: Buffer): Promise<string> {
    const key = this.storageKey(runId, artifactPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
      }),
    );
    return key;
  }

  publicUrl(storageKey: string): string | null {
    if (!this.publicBaseUrl) {
      return null;
    }
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${this.bucket}/${storageKey}`;
  }
}
