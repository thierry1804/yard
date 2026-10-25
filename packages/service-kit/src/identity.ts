import type { FastifyRequest } from 'fastify';
import { roleSchema, type Actor, type Role } from '@ccis/contracts';
import { errors } from './errors';

export interface Identity {
  userId: string;
  role: Role;
  email?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity?: Identity;
  }
}

const RANK: Record<Role, number> = { VIEWER: 0, OPERATOR: 1, ADMIN: 2 };

// Identity is injected by the gateway after verifying the JWT; services are
// only reachable on the internal network, so these headers are trusted here.
export function readIdentity(req: FastifyRequest): Identity | null {
  const userId = req.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.length === 0) return null;
  const role = roleSchema.safeParse(req.headers['x-user-role']);
  if (!role.success) return null;
  const email = req.headers['x-user-email'];
  return typeof email === 'string' && email.length > 0 ? { userId, role: role.data, email } : { userId, role: role.data };
}

export function requireRole(min: Role) {
  return async (req: FastifyRequest): Promise<void> => {
    const identity = readIdentity(req);
    if (!identity) throw errors.unauthorized('Authentification requise.');
    if (RANK[identity.role] < RANK[min]) {
      throw errors.forbidden(`Action réservée au rôle ${min} (vous êtes ${identity.role}).`);
    }
    req.identity = identity;
  };
}

export function actorOf(req: FastifyRequest): Actor {
  return req.identity ? { userId: req.identity.userId, role: req.identity.role } : null;
}
