import type { FastifyReply, FastifyRequest } from 'fastify';
import { errors } from '@ccis/service-kit';

export interface Target {
  name: string;
  url: string;
}

// Rebuilds outgoing headers from scratch: client-supplied x-user-* headers and
// the Authorization header never reach the services.
export function forwardTo(target: Target, timeoutMs = 5000) {
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
