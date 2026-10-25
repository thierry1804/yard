import { randomBytes } from 'node:crypto';
import type { VerifiedIdentity } from './verify';

// One-time WebSocket tickets: browsers cannot set headers on the upgrade
// request, and a ticket keeps the JWT out of URLs and logs.
export class TicketStore {
  private readonly tickets = new Map<string, { identity: VerifiedIdentity; expiresAt: number }>();

  constructor(private readonly ttlMs = 30_000, private readonly now: () => number = Date.now) {}

  issue(identity: VerifiedIdentity): string {
    this.sweep();
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(ticket, { identity, expiresAt: this.now() + this.ttlMs });
    return ticket;
  }

  consume(ticket: string): VerifiedIdentity | null {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < this.now()) return null;
    return entry.identity;
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, v] of this.tickets) if (v.expiresAt < t) this.tickets.delete(k);
  }
}
