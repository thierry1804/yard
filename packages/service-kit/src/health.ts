import type { FastifyInstance } from 'fastify';

export type ReadinessCheck = () => Promise<void>;

export function registerHealth(app: FastifyInstance, checks: Record<string, ReadinessCheck>): void {
  app.get('/health/live', async () => ({ ok: true }));
  app.get('/health/ready', async (_req, reply) => {
    const results: Record<string, string> = {};
    let ok = true;
    for (const [name, check] of Object.entries(checks)) {
      try {
        await check();
        results[name] = 'ok';
      } catch (err) {
        ok = false;
        results[name] = err instanceof Error ? err.message : 'ko';
      }
    }
    reply.code(ok ? 200 : 503);
    return { ok, checks: results };
  });
}
