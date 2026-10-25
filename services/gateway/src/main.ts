import { AmqpClient } from '@ccis/messaging';
import { buildGatewayApp } from './app';
import { config } from './config';
import { startFanout } from './fanout';
import { Hub } from './hub';
import { TicketStore } from './tickets';
import { createTokenVerifier } from './verify';

const hub = new Hub();
let amqp: AmqpClient | undefined;

const app = await buildGatewayApp({
  verify: await createTokenVerifier(config.publicKeyPem()),
  services: { auth: { name: 'auth', url: config.authUrl }, yard: { name: 'yard', url: config.yardUrl } },
  tickets: new TicketStore(),
  hub,
  corsOrigin: config.corsOrigin,
  checks: { broker: async () => { if (!amqp?.connected) throw new Error('RabbitMQ non connecté'); } },
});

amqp = new AmqpClient(config.amqpUrl, app.log);
startFanout(amqp, hub, app.log);

const shutdown = async () => {
  hub.closeAll();
  await app.close();
  await amqp?.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await amqp.start();
await app.listen({ port: config.port, host: config.host });
