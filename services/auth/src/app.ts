import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createApp, errors, requireRole } from '@ccis/service-kit';
import type { PrismaClient, User } from './generated/prisma';
import { verifyPassword } from './passwords';
import { FixedWindowLimiter } from './rate-limiter';
import type { TokenSigner } from './tokens';

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export interface AuthDeps {
  prisma: PrismaClient;
  signer: TokenSigner;
  limiter?: FixedWindowLimiter;
  logger?: boolean;
}

export function buildAuthApp(deps: AuthDeps): FastifyInstance {
  const limiter = deps.limiter ?? new FixedWindowLimiter(5, 60_000);
  const app = createApp({
    service: 'auth-service',
    logger: deps.logger,
    trustProxy: true,
    checks: { database: async () => { await deps.prisma.$queryRaw`SELECT 1`; } },
  });

  app.post('/auth/login', async (req) => {
    const { email, password } = loginBody.parse(req.body);
    const normalized = email.trim().toLowerCase();
    // Count both keys on every attempt (no short-circuit).
    const ipOk = limiter.hit(`ip:${req.ip}`);
    const emailOk = limiter.hit(`email:${normalized}`);
    if (!ipOk || !emailOk) throw errors.rateLimited('Trop de tentatives, réessayez dans une minute.');

    const user = await deps.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.active || !(await verifyPassword(user.passwordHash, password))) {
      throw errors.unauthorized('Email ou mot de passe incorrect.');
    }
    await deps.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { accessToken: await deps.signer.sign(user), user: publicUser(user) };
  });

  app.get('/auth/me', { preHandler: requireRole('VIEWER') }, async (req) => {
    const user = await deps.prisma.user.findUnique({ where: { id: req.identity!.userId } });
    if (!user || !user.active) throw errors.unauthorized('Utilisateur inconnu ou désactivé.');
    return publicUser(user);
  });

  return app;
}
