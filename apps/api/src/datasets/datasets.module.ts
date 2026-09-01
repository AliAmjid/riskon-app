import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dataset } from '../database/entities/dataset.entity.js';
import { DatasetsController } from './datasets.controller.js';
import { DatasetsService } from './datasets.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Dataset])],
  controllers: [DatasetsController],
  providers: [DatasetsService],
  exports: [DatasetsService],
})
export class DatasetsModule {}
