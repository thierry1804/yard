import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { createApp, errors, type ReadinessCheck } from '@ccis/service-kit';
import { forwardTo, type Target } from './forward';
import type { Hub } from './hub';
import type { TicketStore } from './tickets';
import type { TokenVerifier, VerifiedIdentity } from './verify';

export interface GatewayDeps {
  verify: TokenVerifier;
  services: { auth: Target; yard: Target };
  tickets: TicketStore;
  hub: Hub;
  corsOrigin: string[];
  checks?: Record<string, ReadinessCheck>;
  logger?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    tokenExp?: number;
  }
}

const PUBLIC_ROUTES = new Set(['/auth/login', '/ws', '/health/live', '/health/ready']);
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

export async function buildGatewayApp(deps: GatewayDeps): Promise<FastifyInstance> {
  const app = createApp({ service: 'gateway', checks: deps.checks, logger: deps.logger });
  await app.register(cors, {
    origin: deps.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-correlation-id'],
  });
  await app.register(websocket);

  app.addHook('onRequest', async (req) => {
    if (req.method === 'OPTIONS') return;
    const route = req.routeOptions.url;
    if (route && PUBLIC_ROUTES.has(route)) return;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw errors.unauthorized('Authentification requise.');
    let identity: VerifiedIdentity;
    try {
      identity = await deps.verify(header.slice('Bearer '.length));
    } catch {
      throw errors.unauthorized('Session expirée ou jeton invalide, reconnectez-vous.');
    }
    req.identity = { userId: identity.userId, role: identity.role, ...(identity.email ? { email: identity.email } : {}) };
    req.tokenExp = identity.exp;
  });

  // ----- auth -----
  app.post('/auth/login', forwardTo(deps.services.auth));
  app.get('/auth/me', forwardTo(deps.services.auth));

  // ----- realtime -----
  app.post('/ws-ticket', async (req) => ({
    ticket: deps.tickets.issue({ userId: req.identity!.userId, role: req.identity!.role, exp: req.tokenExp! }),
  }));

  app.get('/ws', { websocket: true }, (socket, req) => {
    const ticket = (req.query as { ticket?: string }).ticket;
    const identity = ticket ? deps.tickets.consume(ticket) : null;
    if (!identity) {
      socket.close(4401, 'unauthorized');
      return;
    }
    deps.hub.add(socket, identity.exp);
  });

  // ----- yard -----
  const yard = forwardTo(deps.services.yard);
  for (const prefix of ['/zones', '/containers', '/movements', '/operations']) {
    app.route({ method: [...METHODS], url: prefix, handler: yard });
    app.route({ method: [...METHODS], url: `${prefix}/*`, handler: yard });
  }

  return app;
}
