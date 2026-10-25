import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { createEnvelope, type Envelope } from '@ccis/contracts';
import { AmqpClient, OutboxRelay, declareExchanges, subscribeEphemeral, type OutboxRecord, type OutboxStore } from '../src/index';

const silent = { info: () => {}, warn: () => {}, error: () => {} };

class MemoryStore implements OutboxStore {
  pending: OutboxRecord[] = [];
  published: string[] = [];
  calls = 0;
  async claimBatch(limit: number, publish: (r: OutboxRecord[]) => Promise<void>) {
    this.calls++;
    const batch = this.pending.slice(0, limit);
    if (batch.length === 0) return 0;
    await publish(batch);
    this.pending = this.pending.slice(batch.length);
    this.published.push(...batch.map((b) => b.id));
    return batch.length;
  }
}

function record(zoneId: string): OutboxRecord {
  const env = createEnvelope('yard.zone.deleted', { zoneId }, {
    source: 'test', correlationId: 'c', aggregateId: zoneId, aggregateVersion: 1, actor: null,
  });
  return { id: env.id, exchange: 'yard.events', routingKey: env.type, payload: env };
}

function waitFor(cond: () => boolean, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (cond()) { clearInterval(t); resolve(); }
      else if (Date.now() - start > ms) { clearInterval(t); reject(new Error('timeout')); }
    }, 20);
  });
}

let rabbit: StartedRabbitMQContainer;
let url: string;

beforeAll(async () => {
  rabbit = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
  url = rabbit.getAmqpUrl();
});
afterAll(async () => { await rabbit?.stop(); });

describe('OutboxRelay', () => {
  it('publishes pending records and a subscriber receives them in order', async () => {
    const publisher = new AmqpClient(url, silent);
    publisher.onConnected((ch) => declareExchanges(ch, ['yard.events']));
    const consumer = new AmqpClient(url, silent);
    const received: Envelope[] = [];
    subscribeEphemeral(consumer, {
      queuePrefix: 'test',
      bindings: [{ exchange: 'yard.events', pattern: 'yard.zone.*' }],
      onMessage: (env) => received.push(env),
      log: silent,
    });
    await publisher.start();
    await consumer.start();

    const store = new MemoryStore();
    store.pending.push(record('A'), record('B'), record('C'));
    const relay = new OutboxRelay({ store, client: publisher, log: silent, intervalMs: 50, batchSize: 2 });
    relay.start();

    await waitFor(() => received.length === 3);
    expect(received.map((e) => (e.data as { zoneId: string }).zoneId)).toEqual(['A', 'B', 'C']);
    expect(store.pending).toHaveLength(0);

    await relay.stop();
    await publisher.stop();
    await consumer.stop();
  });

  it('relay waits for the broker: nothing is claimed while disconnected', async () => {
    const client = new AmqpClient(url, silent);
    client.onConnected((ch) => declareExchanges(ch, ['yard.events']));
    const store = new MemoryStore();
    store.pending.push(record('Z'));
    const relay = new OutboxRelay({ store, client, log: silent, intervalMs: 20 });
    relay.start();
    await new Promise((r) => setTimeout(r, 150));
    expect(store.calls).toBe(0);
    expect(store.pending).toHaveLength(1);

    await client.start();
    await waitFor(() => store.pending.length === 0);
    await relay.stop();
    await client.stop();
  });

  it('keeps records when publication fails (unknown exchange)', async () => {
    const client = new AmqpClient(url, silent);
    await client.start();
    const store = new MemoryStore();
    store.pending.push({ ...record('X'), exchange: 'does.not.exist' });
    const relay = new OutboxRelay({ store, client, log: silent, intervalMs: 1000 });
    relay.kick();
    await new Promise((r) => setTimeout(r, 300));
    expect(store.pending).toHaveLength(1);
    await relay.stop();
    await client.stop();
  });
});

describe('AmqpClient', () => {
  it('notifies onDisconnected when the connection is lost, then reconnects', async () => {
    const client = new AmqpClient(url, silent);
    let disconnects = 0;
    let connects = 0;
    client.onDisconnected(() => { disconnects++; });
    client.onConnected(async () => { connects++; });
    await client.start();
    // Publishing to a missing exchange makes the broker close the channel.
    client.channel!.publish('missing.exchange', 'x', Buffer.from('{}'));
    await waitFor(() => disconnects === 1);
    await waitFor(() => connects === 2, 10_000);
    expect(client.connected).toBe(true);
    await client.stop();
  });

  it('retries until the broker is reachable', async () => {
    const client = new AmqpClient('amqp://guest:guest@127.0.0.1:1', silent);
    await client.start();
    expect(client.connected).toBe(false);
    await client.stop();
  });
});
