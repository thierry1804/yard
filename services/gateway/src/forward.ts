import type { FastifyReply, FastifyRequest } from 'fastify';
import { errors } from '@ccis/service-kit';

export interface Target {
  name: string;
  url: string;
}

// Rebuilds outgoing headers from scratch: client-supplied x-user-* headers and
// the Authorization header never reach the services.
// Must exceed the slowest upstream operation: yard transactions wait at most
// 3 s for a connection/lock and run at most 10 s. Timing out earlier would
// report a 503 for work that later commits (and invite a duplicate retry).
export const UPSTREAM_TIMEOUT_MS = 15_000;

export function forwardTo(target: Target, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': req.id,
      'x-forwarded-for': req.ip,
    };
    if (req.identity) {
      headers['x-user-id'] = req.identity.userId;
      headers['x-user-role'] = req.identity.role;
    }
    const hasBody = req.body !== undefined && req.body !== null && req.method !== 'GET' && req.method !== 'HEAD';
    if (hasBody) headers['content-type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(target.url + req.url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      req.log.warn({ err, service: target.name }, 'upstream unreachable');
      throw errors.serviceUnavailable(`Service ${target.name} indisponible, réessayez dans un instant.`);
    }

    reply.code(res.status);
    const contentType = res.headers.get('content-type');
    if (contentType) reply.header('content-type', contentType);
    const text = await res.text();
    return reply.send(text.length > 0 ? text : undefined);
  };
}
