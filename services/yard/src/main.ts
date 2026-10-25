import { AmqpClient, OutboxRelay, declareExchanges, prismaOutboxStore, type PrismaLike } from '@ccis/messaging';
import { PrismaClient } from './generated/prisma';
import { buildYardApp } from './app';
import { config } from './config';
import { YardService } from './yard-service';

const prisma = new PrismaClient();
let relay: OutboxRelay | undefined;
const service = new YardService(prisma, () => relay?.kick());
let amqp: AmqpClient | undefined;

const app = buildYardApp({
  service,
  checks: {
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    broker: async () => { if (!amqp?.connected) throw new Error('RabbitMQ non connecté'); },
  },
});

amqp = new AmqpClient(config.amqpUrl, app.log);
amqp.onConnected((ch) => declareExchanges(ch, ['yard.events', 'yard.commands']));
relay = new OutboxRelay({ store: prismaOutboxStore(prisma as unknown as PrismaLike), client: amqp, log: app.log });

const shutdown = async () => {
  await app.close();
  await relay?.stop();
  await amqp?.stop();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await amqp.start();
relay.start();
await app.listen({ port: config.port, host: config.host });
