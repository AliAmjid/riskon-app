import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RunEventPayload } from '@riskon/shared';

function socketUrl(): string {
  const api = import.meta.env.VITE_API_URL;
  if (api) {
    return api;
  }
  return window.location.origin;
}

export function useRunEvents(runId: string | null) {
  const [events, setEvents] = useState<RunEventPayload[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const socket = io(socketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('run:subscribe', { runId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('run:event', (event: RunEventPayload) => {
      setEvents((prev) => [...prev, event]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [runId]);

  return { events, connected };
}
