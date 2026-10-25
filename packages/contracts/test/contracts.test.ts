import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createEnvelope, exchangeFor, parseEnvelope } from '../src/index';

const container = {
  id: 'c0a8012e-0000-4000-8000-000000000001',
  containerNo: 'MSCU1234567',
  type: 'FULL_20' as const,
  isoCode: '22G1',
  client: 'Star',
  weightKg: 12000,
  position: { zoneId: 'A', row: 0, col: 1, tier: 1 },
  entryDate: '2026-10-25T10:00:00.000Z',
  plannedExitDate: null,
  customsStatus: 'RELEASED' as const,
  version: 1,
};
const meta = {
  source: 'yard-service',
  correlationId: 'corr-1',
  aggregateId: container.id,
  aggregateVersion: 1,
  actor: { userId: 'u1', role: 'OPERATOR' as const },
};

describe('createEnvelope', () => {
  it('builds a complete v1 envelope', () => {
    const env = createEnvelope('yard.container.arrived', { container }, meta);
    expect(env.type).toBe('yard.container.arrived');
    expect(env.version).toBe(1);
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.causationId).toBeNull();
    expect(env.data.container.containerNo).toBe('MSCU1234567');
    expect(() => new Date(env.occurredAt).toISOString()).not.toThrow();
  });

  it('rejects data that does not match the schema', () => {
    expect(() =>
      createEnvelope('yard.container.arrived', { container: { ...container, type: 'BOAT' } } as never, meta),
    ).toThrow(ZodError);
  });

  it('generates time-ordered ids', () => {
    const a = createEnvelope('yard.zone.deleted', { zoneId: 'A' }, meta);
    const b = createEnvelope('yard.zone.deleted', { zoneId: 'B' }, meta);
    expect(a.id < b.id).toBe(true);
  });
});

describe('parseEnvelope', () => {
  it('round-trips through JSON', () => {
    const env = createEnvelope('yard.container.moved', { container, from: container.position, to: { ...container.position, col: 2 } }, meta);
    const parsed = parseEnvelope(JSON.parse(JSON.stringify(env)));
    expect(parsed).toEqual(env);
  });

  it('rejects unknown event types', () => {
    const env = { ...createEnvelope('yard.zone.deleted', { zoneId: 'A' }, meta), type: 'yard.zone.exploded' };
    expect(() => parseEnvelope(env)).toThrow(/inconnu/);
  });
});

describe('exchangeFor', () => {
  it('maps the domain prefix to its events exchange', () => {
    expect(exchangeFor('yard.container.moved')).toBe('yard.events');
    expect(exchangeFor('telemetry.alert.raised')).toBe('telemetry.events');
  });
});
