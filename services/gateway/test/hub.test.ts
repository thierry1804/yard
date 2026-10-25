import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Hub } from '../src/hub';

class FakeSocket extends EventEmitter {
  readyState = 1;
  pings = 0;
  terminated = false;
  ping() { this.pings++; }
  terminate() { this.terminated = true; this.emit('close'); }
  close() { this.emit('close'); }
  send() {}
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Hub heartbeat', () => {
  it('pings every interval and terminates sockets that stopped answering', () => {
    const hub = new Hub(30_000);
    const alive = new FakeSocket();
    const dead = new FakeSocket();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    hub.add(alive as unknown as WebSocket, exp);
    hub.add(dead as unknown as WebSocket, exp);

    vi.advanceTimersByTime(30_000);
    expect(alive.pings).toBe(1);
    expect(dead.pings).toBe(1);
    alive.emit('pong');

    vi.advanceTimersByTime(30_000);
    expect(alive.terminated).toBe(false);
    expect(dead.terminated).toBe(true);
    expect(hub.size).toBe(1);
    hub.stop();
  });
});
