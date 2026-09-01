import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { RunEventPayload } from '@riskon/shared';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  emitRunEvent(runId: string, event: RunEventPayload): void {
    this.server.to(`run:${runId}`).emit('run:event', event);
  }

  emitRunUpdated(
    runId: string,
    patch: {
      status?: string;
      result?: string | null;
      errorMessage?: string | null;
    },
  ): void {
    this.server.to(`run:${runId}`).emit('run:updated', { runId, ...patch });
  }

  @SubscribeMessage('run:subscribe')
  handleSubscribe(
    @MessageBody() data: { runId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(`run:${data.runId}`);
    client.emit('run:subscribed', { runId: data.runId });
  }
}
