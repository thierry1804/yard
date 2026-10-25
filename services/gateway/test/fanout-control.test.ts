import { describe, expect, it } from 'vitest';
import type { AmqpClient } from '@ccis/messaging';
import { startFanout } from '../src/fanout';
import type { Hub } from '../src/hub';

const silent = { info: () => {}, warn: () => {}, error: () => {} };

function fakeClient() {
  const connected: ((ch: unknown) => Promise<void>)[] = [];
  const disconnected: (() => void)[] = [];
  const ch = {
    assertQueue: async (q: string) => ({ queue: q }),
    bindQueue: async () => {},
    consume: async () => {},
  };
  return {
    client: {
      onConnected: (fn: (ch: unknown) => Promise<void>) => connected.push(fn),
      onDisconnected: (fn: () => void) => disconnected.push(fn),
    } as unknown as AmqpClient,
    connect: async () => { for (const fn of connected) await fn(ch); },
    disconnect: () => { for (const fn of disconnected) fn(); },
  };
}

describe('startFanout control frames', () => {
  it('tells browsers when realtime is degraded, and to resync after every reconnection', async () => {
    const frames: { event: string }[] = [];
    const hub = { broadcast: (f: { event: string }) => frames.push(f) } as unknown as Hub;
    const fake = fakeClient();
    startFanout(fake.client, hub, silent);

    await fake.connect();
    expect(frames).toEqual([]);
    fake.disconnect();
    expect(frames.map((f) => f.event)).toEqual(['realtime.degraded']);
    await fake.connect();
    expect(frames.map((f) => f.event)).toEqual(['realtime.degraded', 'realtime.resync']);
  });
});
