import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type {
  RunArtifactSummary,
  RunEventPayload,
  RunQuestionRequest,
  RunSubscribeMessage,
  RunUpdatedMessage,
} from '@riskon/shared';

/**
 * One Socket.IO room per run. The web app joins the room for the run it is
 * showing, so an idle browser tab does not receive another run's stream.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  emitRunEvent(runId: string, event: RunEventPayload): void {
    this.to(runId).emit('run:event', event);
  }

  emitRunUpdated(runId: string, patch: Omit<RunUpdatedMessage, 'runId'>): void {
    this.to(runId).emit('run:updated', { runId, ...patch });
  }

  emitRunQuestion(runId: string, question: RunQuestionRequest): void {
    this.to(runId).emit('run:question', question);
  }

  emitQuestionResolved(runId: string, question: RunQuestionRequest): void {
    this.to(runId).emit('run:question-resolved', question);
  }

  emitArtifact(runId: string, artifact: RunArtifactSummary): void {
    this.to(runId).emit('run:artifact', artifact);
  }

  @SubscribeMessage('run:subscribe')
  handleSubscribe(
    @MessageBody() data: RunSubscribeMessage,
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(`run:${data.runId}`);
    client.emit('run:subscribed', { runId: data.runId });
  }

  @SubscribeMessage('run:unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: RunSubscribeMessage,
    @ConnectedSocket() client: Socket,
  ): void {
    void client.leave(`run:${data.runId}`);
  }

  private to(runId: string) {
    return this.server.to(`run:${runId}`);
  }
}
