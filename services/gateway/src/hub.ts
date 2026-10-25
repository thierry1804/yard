import type { WebSocket } from 'ws';

const MAX_TIMEOUT = 2_147_000_000;

// Connected browsers. Each socket is closed with 4401 when its JWT expires, so
// the frontend sends the user back to the login screen instead of silently
// losing realtime updates.
export class Hub {
  private readonly sockets = new Map<WebSocket, NodeJS.Timeout>();

  add(socket: WebSocket, expSeconds: number): void {
    const ms = Math.min(Math.max(expSeconds * 1000 - Date.now(), 0), MAX_TIMEOUT);
    const timer = setTimeout(() => socket.close(4401, 'session expired'), ms);
    this.sockets.set(socket, timer);
    socket.on('close', () => {
      clearTimeout(timer);
      this.sockets.delete(socket);
    });
  }

  broadcast(frame: { event: string; data: unknown; at: string }): void {
    const data = JSON.stringify(frame);
    for (const socket of this.sockets.keys()) {
      if (socket.readyState === 1) socket.send(data);
    }
  }

  get size(): number {
    return this.sockets.size;
  }

  closeAll(): void {
    for (const socket of this.sockets.keys()) socket.close(1001, 'shutdown');
  }
}
