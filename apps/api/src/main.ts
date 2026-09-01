import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfig);

  app.enableCors({ origin: true });
  // The MCP endpoint is unaffected: it reads the raw request rather than a
  // @Body-decorated DTO, so there is nothing for the pipe to validate there.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`Riskon API listening on port ${config.port}`);
  logger.log(`Agent repository: ${config.agentRepositoryUrl}`);
  config.warnAboutReachability();
}

await bootstrap();
