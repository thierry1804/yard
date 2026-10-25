import { randomUUID } from 'node:crypto';
import { envelopeSchema, type Envelope } from '@ccis/contracts';
import type { AmqpClient, Logger } from './amqp-client';

export interface Binding {
  exchange: string;
  pattern: string;
}

// Exclusive, auto-deleted queue re-created on every reconnection. For
// consumers that only relay live notifications (gateway → browsers): missed
// messages are acceptable because clients resynchronise on reconnect.
export function subscribeEphemeral(
  client: AmqpClient,
  opts: { queuePrefix: string; bindings: Binding[]; onMessage: (env: Envelope) => void; log: Logger },
): void {
  client.onConnected(async (ch) => {
    const { queue } = await ch.assertQueue(`${opts.queuePrefix}.${randomUUID()}`, {
      exclusive: true,
      autoDelete: true,
      durable: false,
    });
    for (const b of opts.bindings) await ch.bindQueue(queue, b.exchange, b.pattern);
    await ch.consume(
      queue,
      (msg) => {
        if (!msg) return;
        try {
          opts.onMessage(envelopeSchema.parse(JSON.parse(msg.content.toString())) as Envelope);
        } catch (err) {
          opts.log.warn({ err }, 'message ignoré : enveloppe invalide');
        }
      },
      { noAck: true },
    );
  });
}
