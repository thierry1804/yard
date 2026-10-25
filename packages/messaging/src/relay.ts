import type { ConfirmChannel } from 'amqplib';
import type { AmqpClient, Logger } from './amqp-client';
import type { OutboxRecord, OutboxStore } from './outbox';

export async function publishAll(ch: ConfirmChannel, records: OutboxRecord[]): Promise<void> {
  for (const r of records) {
    ch.publish(r.exchange, r.routingKey, Buffer.from(JSON.stringify(r.payload)), {
      persistent: true,
      contentType: 'application/json',
      messageId: r.payload.id,
      type: r.payload.type,
      timestamp: Date.now(),
    });
  }
  await ch.waitForConfirms();
}

export interface OutboxRelayOptions {
  store: OutboxStore;
  client: AmqpClient;
  log: Logger;
  intervalMs?: number;
  batchSize?: number;
}

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;

  constructor(private readonly opts: OutboxRelayOptions) {}

  start(): void {
    this.timer = setInterval(() => this.kick(), this.opts.intervalMs ?? 250);
    this.kick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((r) => setTimeout(r, 20));
  }

  // Called after each commit by the owning service, and by the interval.
  kick(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    const size = this.opts.batchSize ?? 100;
    try {
      do {
        this.again = false;
        const ch = this.opts.client.channel;
        if (!ch) break;
        let claimed: number;
        do {
          claimed = await this.opts.store.claimBatch(size, (records) => publishAll(ch, records));
        } while (claimed === size);
      } while (this.again);
    } catch (err) {
      this.opts.log.warn({ err }, 'outbox relay: publication échouée, nouvel essai au prochain cycle');
    } finally {
      this.running = false;
    }
  }
}
