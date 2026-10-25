import { describe, expect, it } from 'vitest';
import { coalesce } from './coalesce';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe('coalesce', () => {
  it('runs at most one call at a time and merges bursts into a single follow-up', async () => {
    const runs = [];
    const gates = [];
    const run = coalesce(() => {
      const d = deferred();
      runs.push(runs.length);
      gates.push(d);
      return d.promise;
    });

    run(); run(); run(); run();
    expect(runs).toEqual([0]);
    gates[0].resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toEqual([0, 1]);
    gates[1].resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toEqual([0, 1]);
  });

  it('keeps working after a failed call', async () => {
    let calls = 0;
    const run = coalesce(async () => { calls++; if (calls === 1) throw new Error('boom'); });
    await run();
    await run();
    expect(calls).toBe(2);
  });
});
