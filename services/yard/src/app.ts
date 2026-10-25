import type { FastifyInstance } from 'fastify';
import { createApp, type ReadinessCheck } from '@ccis/service-kit';
import { registerRoutes } from './routes';
import type { YardService } from './yard-service';

export function buildYardApp(deps: { service: YardService; checks?: Record<string, ReadinessCheck>; logger?: boolean }): FastifyInstance {
  const app = createApp({ service: 'yard-service', checks: deps.checks, logger: deps.logger });
  registerRoutes(app, deps.service);
  return app;
}
