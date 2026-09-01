import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';

/**
 * Global: the gateway is a single socket server, and both the run pipeline and
 * the MCP question channel push through it.
 */
@Global()
@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
