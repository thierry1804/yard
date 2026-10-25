import type { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { envelopeSchema, type Actor, type Envelope } from './envelope';
import { yardEventSchemas } from './yard-events';

export const eventSchemas = { ...yardEventSchemas } as const;
export type EventType = keyof typeof eventSchemas;
export type EventData<T extends EventType> = z.infer<(typeof eventSchemas)[T]>;

const EVENT_VERSION = 1;

export interface EnvelopeMeta {
  source: string;
  correlationId: string;
  causationId?: string | null;
  aggregateId: string;
  aggregateVersion: number;
  actor: Actor;
}

export function createEnvelope<T extends EventType>(
  type: T,
  data: EventData<T>,
  meta: EnvelopeMeta,
): Envelope<T, EventData<T>> {
  const parsed = eventSchemas[type].parse(data) as EventData<T>;
  return {
    id: uuidv7(),
    type,
    version: EVENT_VERSION,
    occurredAt: new Date().toISOString(),
    source: meta.source,
    correlationId: meta.correlationId,
    causationId: meta.causationId ?? null,
    aggregateId: meta.aggregateId,
    aggregateVersion: meta.aggregateVersion,
    actor: meta.actor,
    data: parsed,
  };
}

export function parseEnvelope(raw: unknown): Envelope {
  const env = envelopeSchema.parse(raw);
  const schema = (eventSchemas as Record<string, z.ZodTypeAny>)[env.type];
  if (!schema) throw new Error(`Type d'événement inconnu : ${env.type}`);
  return { ...env, data: schema.parse(env.data) };
}

export function exchangeFor(type: string): string {
  return `${type.split('.')[0]}.events`;
}
