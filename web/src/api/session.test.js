import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreSession } from './session';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('restoreSession', () => {
  it('keeps the session through a network/gateway failure and retries', async () => {
    const results = [httpError(503), { id: 'u1' }];
    const me = vi.fn(async () => { const r = results.shift(); if (r instanceof Error) throw r; return r; });
    const onUser = vi.fn();
    const onRetrying = vi.fn();
    restoreSession({ me, onUser, onRetrying, delayMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onRetrying).toHaveBeenCalledTimes(1);
    expect(onUser).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('a 401 ends the attempt without retrying (the API client logs out)', async () => {
    const me = vi.fn(async () => { throw httpError(401); });
    const onRetrying = vi.fn();
    restoreSession({ me, onUser: vi.fn(), onRetrying });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(me).toHaveBeenCalledTimes(1);
    expect(onRetrying).not.toHaveBeenCalled();
  });

  it('cancel stops retries', async () => {
    const me = vi.fn(async () => { throw httpError(503); });
    const cancel = restoreSession({ me, onUser: vi.fn(), delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(me).toHaveBeenCalledTimes(1);
  });
});
