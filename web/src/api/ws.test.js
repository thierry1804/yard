import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectYardSocket } from './ws';

class FakeWebSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeWebSocket.instances.push(this); }
  open() { this.onopen?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  serverClose(code = 1006) { this.onclose?.({ code }); }
  close() { this.closed = true; }
}

// setTimeout is faked: advance the fake clock by 0 to flush pending promises.
const flush = () => vi.advanceTimersByTimeAsync(0);

function setup(overrides = {}) {
  const calls = { statuses: [], connected: 0, events: [], unauthorized: 0, tickets: 0 };
  const disconnect = connectYardSocket({
    getTicket: async () => `t${++calls.tickets}`,
    onEvent: (e) => calls.events.push(e),
    onConnected: () => calls.connected++,
    onStatus: (s) => calls.statuses.push(s),
    onUnauthorized: () => calls.unauthorized++,
    WebSocketImpl: FakeWebSocket,
    wsUrl: 'ws://gw',
    ...overrides,
  });
  return { calls, disconnect };
}

beforeEach(() => { FakeWebSocket.instances = []; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('connectYardSocket', () => {
  it('connects with a fresh ticket, reports connected and triggers a resync', async () => {
    const { calls } = setup();
    await vi.runOnlyPendingTimersAsync();
    await flush();
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('ws://gw/ws?ticket=t1');
    ws.open();
    expect(calls.statuses.at(-1)).toBe('connected');
    expect(calls.connected).toBe(1);
    ws.message({ event: 'yard.container.moved', data: {} });
    expect(calls.events).toEqual([{ event: 'yard.container.moved', data: {} }]);
  });

  it('on loss: reconnecting, retries with a new ticket, resyncs again', async () => {
    const { calls } = setup();
    await flush();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose(1006);
    expect(calls.statuses.at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    const second = FakeWebSocket.instances[1];
    expect(second.url).toBe('ws://gw/ws?ticket=t2');
    second.open();
    expect(calls.connected).toBe(2);
    expect(calls.statuses.at(-1)).toBe('connected');
  });

  it('becomes disconnected after 30 s without connection and stays red while retrying', async () => {
    const { calls } = setup({ getTicket: async () => { throw new Error('network'); } });
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.statuses.at(-1)).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.statuses.at(-1)).toBe('disconnected');
  });

  it('realtime.degraded frame: reconnecting; realtime.resync: connected and resync', async () => {
    const { calls } = setup();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(calls.connected).toBe(1);
    ws.message({ event: 'realtime.degraded', data: null, at: 'x' });
    expect(calls.statuses.at(-1)).toBe('reconnecting');
    ws.message({ event: 'realtime.resync', data: null, at: 'x' });
    expect(calls.statuses.at(-1)).toBe('connected');
    expect(calls.connected).toBe(2);
    expect(calls.events).toEqual([]);
  });

  it('close code 4401: unauthorized, no retry', async () => {
    const { calls } = setup();
    await flush();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose(4401);
    expect(calls.unauthorized).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('a 401 while fetching the ticket stops without retrying', async () => {
    const err = Object.assign(new Error('401'), { status: 401 });
    const { calls } = setup({ getTicket: async () => { throw err; } });
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.tickets).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('disconnect() stops everything', async () => {
    const { disconnect } = setup();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    disconnect();
    expect(ws.closed).toBe(true);
    ws.serverClose(1006);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
