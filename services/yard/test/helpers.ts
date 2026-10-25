import { inject } from 'vitest';
import { PrismaClient } from '../src/generated/prisma';
import type { Ctx } from '../src/yard-service';

export const prisma = new PrismaClient({ datasourceUrl: inject('databaseUrl') });

export const operator: Ctx = { actor: { userId: 'u-op', role: 'OPERATOR' }, correlationId: 'corr-test' };

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "AuditEvent", "WorkTask", "OperationRecord", "Movement", "ReeferState", "Container", "Zone", outbox CASCADE');
}

export async function outboxTypes(): Promise<string[]> {
  const rows = await prisma.outboxMessage.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map((r) => r.routingKey);
}
