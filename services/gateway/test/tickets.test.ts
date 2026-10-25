import { describe, expect, it } from 'vitest';
import { TicketStore } from '../src/tickets';

const id = { userId: 'u1', role: 'OPERATOR' as const, exp: 9_999_999_999 };

describe('TicketStore', () => {
  it('a ticket can be consumed once', () => {
    const s = new TicketStore();
    const t = s.issue(id);
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(s.consume(t)).toEqual(id);
    expect(s.consume(t)).toBeNull();
  });

  it('expires after the ttl', () => {
    let now = 0;
    const s = new TicketStore(30_000, () => now);
    const t = s.issue(id);
    now = 30_001;
    expect(s.consume(t)).toBeNull();
  });

  it('unknown tickets are rejected', () => {
    expect(new TicketStore().consume('nope')).toBeNull();
  });
});
