import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from '../src/rate-limiter';

describe('FixedWindowLimiter', () => {
  it('allows max hits per window then blocks, per key', () => {
    let now = 0;
    const l = new FixedWindowLimiter(2, 60_000, () => now);
    expect(l.hit('a')).toBe(true);
    expect(l.hit('a')).toBe(true);
    expect(l.hit('a')).toBe(false);
    expect(l.hit('b')).toBe(true);
    now = 60_001;
    expect(l.hit('a')).toBe(true);
  });
});
