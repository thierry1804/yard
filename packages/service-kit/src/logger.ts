import type { FastifyServerOptions } from 'fastify';

export function redactUrl(url: string): string {
  return url.replace(/([?&](?:token|ticket)=)[^&]*/g, '$1***');
}

export function loggerOptions(service: string): FastifyServerOptions['logger'] {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '***' },
    serializers: {
      req: (req: { method: string; url: string; id: string }) => ({
        method: req.method,
        url: redactUrl(req.url),
        correlationId: req.id,
      }),
    },
  };
}
