import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors';

type AnyError = Error & { statusCode?: number };

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<AnyError>((err, req, reply) => {
    const correlationId = req.id;
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: err.message, code: err.code, correlationId });
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const path = issue?.path.join('.');
      const message = issue ? (path ? `${path} : ${issue.message}` : issue.message) : 'Requête invalide.';
      return reply.code(400).send({ error: message, code: 'VALIDATION', correlationId });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message, code: 'VALIDATION', correlationId });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'Erreur interne du serveur.', code: 'INTERNAL', correlationId });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({ error: `Route ${req.method} ${req.url} introuvable.`, code: 'NOT_FOUND', correlationId: req.id }),
  );
}
