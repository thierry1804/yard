import type { WebSocket } from 'ws';

const MAX_TIMEOUT = 2_147_000_000;

// Connected browsers. Each socket is closed with 4401 when its JWT expires, so
// the frontend sends the user back to the login screen instead of silently
// losing realtime updates. A ping/pong heartbeat terminates half-open sockets
// (laptop sleep, network switch) so the browser notices and reconnects.
export class Hub {
  private readonly sockets = new Map<WebSocket, { expiry: NodeJS.Timeout; alive: boolean }>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(heartbeatMs = 30_000) {
    this.heartbeat = setInterval(() => this.beat(), heartbeatMs);
    this.heartbeat.unref?.();
  }

  add(socket: WebSocket, expSeconds: number): void {
    const ms = Math.min(Math.max(expSeconds * 1000 - Date.now(), 0), MAX_TIMEOUT);
    const entry = { expiry: setTimeout(() => socket.close(4401, 'session expired'), ms), alive: true };
    this.sockets.set(socket, entry);
    socket.on('pong', () => {
      entry.alive = true;
    });
    socket.on('close', () => {
      clearTimeout(entry.expiry);
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

  stop(): void {
    clearInterval(this.heartbeat);
  }

  private beat(): void {
    for (const [socket, entry] of this.sockets) {
      if (!entry.alive) {
        socket.terminate();
        continue;
      }
      entry.alive = false;
      socket.ping();
    }
  }
}
