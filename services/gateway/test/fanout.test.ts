import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { createEnvelope } from '@ccis/contracts';
import { AmqpClient, declareExchanges, publishAll } from '@ccis/messaging';
import { startFanout } from '../src/fanout';
import type { Hub } from '../src/hub';

const silent = { info: () => {}, warn: () => {}, error: () => {} };
let rabbit: StartedRabbitMQContainer;

beforeAll(async () => { rabbit = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(); });
afterAll(async () => { await rabbit?.stop(); });

describe('startFanout', () => {
  it('broadcasts every yard event to the hub as a frontend frame', async () => {
    const frames: unknown[] = [];
    const hub = { broadcast: (f: unknown) => frames.push(f) } as unknown as Hub;

    const publisher = new AmqpClient(rabbit.getAmqpUrl(), silent);
    publisher.onConnected((ch) => declareExchanges(ch, ['yard.events']));
    await publisher.start();
    const consumer = new AmqpClient(rabbit.getAmqpUrl(), silent);
    startFanout(consumer, hub, silent);
    await consumer.start();

    const env = createEnvelope('yard.zone.deleted', { zoneId: 'A' }, {
      source: 'test', correlationId: 'c', aggregateId: 'A', aggregateVersion: 2, actor: null,
    });
    await publishAll(publisher.channel!, [{ id: env.id, exchange: 'yard.events', routingKey: env.type, payload: env }]);

    const start = Date.now();
    while (frames.length === 0 && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 20));
    expect(frames).toEqual([{ event: 'yard.zone.deleted', data: { zoneId: 'A' }, at: env.occurredAt }]);
    await publisher.stop();
    await consumer.stop();
  });
});
