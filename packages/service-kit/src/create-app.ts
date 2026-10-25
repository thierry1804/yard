import Fastify, { type FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { registerErrorHandler } from './error-handler';
import { registerHealth, type ReadinessCheck } from './health';
import { loggerOptions } from './logger';

export interface CreateAppOptions {
  service: string;
  checks?: Record<string, ReadinessCheck>;
  logger?: boolean;
  // Only for services reachable exclusively through the gateway (it sets
  // X-Forwarded-For). Never on the internet-facing gateway itself.
  trustProxy?: boolean;
}

export function createApp(opts: CreateAppOptions): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : loggerOptions(opts.service),
    requestIdHeader: 'x-correlation-id',
    genReqId: () => uuidv7(),
    trustProxy: opts.trustProxy ?? false,
  });
  registerErrorHandler(app);
  registerHealth(app, opts.checks ?? {});
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-correlation-id', req.id);
  });
  return app;
}
