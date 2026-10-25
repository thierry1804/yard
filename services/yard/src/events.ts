import { createEnvelope, exchangeFor, type ContainerSnapshot, type EventData, type EventType, type Position } from '@ccis/contracts';
import type { Container, Prisma } from './generated/prisma';
import type { Ctx } from './yard-service';

export function positionOf(c: { zoneId: string; row: number; col: number; tier: number }): Position {
  return { zoneId: c.zoneId, row: c.row, col: c.col, tier: c.tier };
}

export function snapshot(c: Container): ContainerSnapshot {
  return {
    id: c.id,
    containerNo: c.containerNo,
    type: c.type,
    isoCode: c.isoCode,
    client: c.client,
    weightKg: c.weightKg,
    position: positionOf(c),
    entryDate: c.entryDate.toISOString(),
    plannedExitDate: c.plannedExitDate?.toISOString() ?? null,
    customsStatus: c.customsStatus,
    version: c.version,
  };
}

export async function emit<T extends EventType>(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  type: T,
  data: EventData<T>,
  aggregate: { id: string; version: number },
): Promise<void> {
  const env = createEnvelope(type, data, {
    source: 'yard-service',
    correlationId: ctx.correlationId,
    aggregateId: aggregate.id,
    aggregateVersion: aggregate.version,
    actor: ctx.actor,
  });
  await tx.outboxMessage.create({
    data: { id: env.id, exchange: exchangeFor(type), routingKey: type, payload: env as unknown as Prisma.InputJsonValue },
  });
}
