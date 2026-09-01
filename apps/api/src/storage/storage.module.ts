import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { StorageService } from './storage.service.js';

/**
 * Global because both datasets and artifacts need it, and there is exactly one
 * storage root per process.
 */
@Global()
@Module({
  providers: [AppConfig, StorageService],
  exports: [AppConfig, StorageService],
})
export class StorageModule {}
