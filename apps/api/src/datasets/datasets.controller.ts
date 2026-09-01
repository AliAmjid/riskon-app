import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { DatasetSummary } from '@riskon/shared';
import { DatasetsService } from './datasets.service.js';

/**
 * Read straight from the environment rather than AppConfig: the interceptor is
 * configured by a decorator, which is evaluated before any provider exists.
 */
const MAX_UPLOAD_BYTES = Number(
  process.env.MAX_UPLOAD_BYTES ?? String(64 * 1024 * 1024),
);

@Controller('datasets')
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DatasetSummary> {
    if (!file) {
      throw new BadRequestException('Attach a file under the field name "file".');
    }
    return this.datasets.create(file);
  }

  @Get()
  findAll(): Promise<DatasetSummary[]> {
    return this.datasets.findAll();
  }

  /**
   * Unauthenticated on purpose: this is the URL the cloud agent fetches, and it
   * has no credentials of ours. The UUID is the capability.
   */
  @Get(':id/raw')
  async raw(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { dataset, stream } = await this.datasets.openStream(id);
    res.setHeader('Content-Type', dataset.contentType);
    res.setHeader('Content-Length', dataset.sizeBytes);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(dataset.filename)}"`,
    );
    stream.pipe(res);
  }
}
