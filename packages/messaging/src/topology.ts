import type { ConfirmChannel } from 'amqplib';

// Exchanges are created by infra/rabbitmq/init.sh; owners also assert theirs
// (idempotent) so tests and fresh brokers work without the init script.
export async function declareExchanges(ch: ConfirmChannel, names: readonly string[]): Promise<void> {
  for (const name of names) {
    await ch.assertExchange(name, name.endsWith('.commands') ? 'direct' : 'topic', { durable: true });
  }
}
