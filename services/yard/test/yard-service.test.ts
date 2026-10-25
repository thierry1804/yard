import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseEnvelope } from '@ccis/contracts';
import { AppError } from '@ccis/service-kit';
import { YardService } from '../src/yard-service';
import { operator, outboxTypes, prisma, resetDb } from './helpers';

let kicks = 0;
const svc = new YardService(prisma, () => { kicks++; });

async function expectCode(p: Promise<unknown>, code: string, msg?: RegExp) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (msg) expect((err as AppError).message).toMatch(msg);
}

beforeEach(async () => {
  await resetDb();
  kicks = 0;
  await svc.createZone({ id: 'A', label: 'Zone A', rows: 2, cols: 3 }, operator);
  await svc.createZone({ id: 'B', label: 'Zone B', rows: 2, cols: 2 }, operator);
});
afterAll(async () => { await prisma.$disconnect(); });

const arrive = (type: 'FULL_20' | 'FULL_40' | 'EMPTY_20' | 'REEFER', zoneId = 'A', row?: number, col?: number, extra = {}) =>
  svc.arrival({ type, zoneId, row, col, ...extra }, operator);

describe('arrival', () => {
  it('auto-places, records a movement and a valid outbox event, then kicks the relay', async () => {
    const ct = await arrive('FULL_20');
    expect(ct).toMatchObject({ zoneId: 'A', row: 0, col: 0, tier: 1, version: 1, status: 'PRESENT', isoCode: '22G1' });
    expect(ct.containerNo).toMatch(/^[A-Z]{4}\d{7}$/);
    const mv = await prisma.movement.findMany();
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: 'ARRIVAL', toZoneId: 'A', toTier: 1, userId: 'u-op' });
    const out = await prisma.outboxMessage.findMany({ where: { routingKey: 'yard.container.arrived' } });
    expect(out).toHaveLength(1);
    const env = parseEnvelope(out[0].payload);
    expect(env).toMatchObject({ aggregateId: ct.id, aggregateVersion: 1, correlationId: 'corr-test', source: 'yard-service' });
    expect(out[0].exchange).toBe('yard.events');
    expect(kicks).toBeGreaterThan(0);
  });

  it('normalizes container number (lowercase, spaces)', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0, { containerNo: ' mscu 1234567 ' });
    expect(ct.containerNo).toBe('MSCU1234567');
  });

  it('rejects an invalid number and a number already present', async () => {
    await expectCode(arrive('FULL_20', 'A', 0, 0, { containerNo: 'ABC' }), 'VALIDATION');
    await arrive('FULL_20', 'A', 0, 0, { containerNo: 'MSCU1234567' });
    await expectCode(arrive('FULL_20', 'A', 0, 1, { containerNo: 'MSCU1234567' }), 'RULE_VIOLATION', /déjà présent/);
  });

  it("rejects a 40' on a 20' and a full stack", async () => {
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(arrive('FULL_40', 'A', 0, 0), 'RULE_VIOLATION', /40'/);
    await arrive('FULL_20', 'A', 0, 0);
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(arrive('FULL_20', 'A', 0, 0), 'RULE_VIOLATION', /Pile pleine/);
  });

  it('rejects out-of-bounds positions and unknown zones', async () => {
    await expectCode(arrive('FULL_20', 'A', 5, 0), 'VALIDATION');
    await expectCode(arrive('FULL_20', 'Z'), 'NOT_FOUND');
  });

  it('creates reefer state and a reefer.configured event for reefers', async () => {
    const ct = await arrive('REEFER');
    expect(ct.reefer).not.toBeNull();
    expect(await outboxTypes()).toContain('yard.reefer.configured');
  });

  it('concurrent arrivals on a 2-high stack: one succeeds, one gets "Pile pleine", no duplicate tier', async () => {
    await arrive('FULL_20', 'A', 1, 1);
    await arrive('FULL_20', 'A', 1, 1);
    const results = await Promise.allSettled([arrive('FULL_20', 'A', 1, 1), arrive('FULL_20', 'A', 1, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe('RULE_VIOLATION');
    const tiers = (await prisma.container.findMany({ where: { zoneId: 'A', row: 1, col: 1 } })).map((c) => c.tier).sort();
    expect(tiers).toEqual([1, 2, 3]);
  });

  it('the database refuses two present containers in the same slot', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await expect(
      prisma.container.create({
        data: { containerNo: 'TCLU7654321', type: 'FULL_20', isoCode: '22G1', zoneId: 'A', row: 0, col: 0, tier: ct.tier },
      }),
    ).rejects.toThrow();
  });
});

describe('move', () => {
  it('moves the top container and emits yard.container.moved with the new version', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    const moved = await svc.move(ct.id, { toZoneId: 'B', toRow: 1, toCol: 1, expectedVersion: 1 }, operator);
    expect(moved).toMatchObject({ zoneId: 'B', row: 1, col: 1, tier: 1, version: 2 });
    const env = parseEnvelope((await prisma.outboxMessage.findFirstOrThrow({ where: { routingKey: 'yard.container.moved' } })).payload);
    expect(env.aggregateVersion).toBe(2);
  });

  it('refuses to move a container that is not on top', async () => {
    const bottom = await arrive('FULL_20', 'A', 0, 0);
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(svc.move(bottom.id, { toZoneId: 'A', toRow: 1, toCol: 0 }, operator), 'RULE_VIOLATION', /sommet/);
  });

  it('VERSION_CONFLICT when expectedVersion is stale', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 1 }, operator);
    await expectCode(svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 2, expectedVersion: 1 }, operator), 'VERSION_CONFLICT');
  });

  it('refuses a move to the same slot', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await expectCode(svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 0 }, operator), 'VALIDATION');
  });
});

describe('departure', () => {
  it('marks DEPARTED, frees the number for a later arrival', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0, { containerNo: 'MSCU1234567' });
    const gone = await svc.departure(ct.id, {}, operator);
    expect(gone).toMatchObject({ status: 'DEPARTED', version: 2 });
    expect(gone.exitDate).not.toBeNull();
    expect(await outboxTypes()).toContain('yard.container.departed');
    expect((await svc.listContainers({})).map((c) => c.id)).not.toContain(ct.id);
    const again = await arrive('FULL_20', 'A', 0, 0, { containerNo: 'MSCU1234567' });
    expect(again.tier).toBe(1);
  });

  it('refuses a departure of a container that is not on top', async () => {
    const bottom = await arrive('FULL_20', 'A', 0, 0);
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(svc.departure(bottom.id, {}, operator), 'RULE_VIOLATION');
  });
});

describe('transfer', () => {
  it('places in the first free slot of the target zone', async () => {
    const ct = await arrive('FULL_40', 'A', 0, 0);
    const t = await svc.transfer(ct.id, { targetZoneId: 'B' }, operator);
    expect(t).toMatchObject({ zoneId: 'B', row: 0, col: 0, tier: 1 });
    expect(await outboxTypes()).toContain('yard.container.transferred');
  });

  it('refuses a transfer to the same zone', async () => {
    const ct = await arrive('FULL_40', 'A', 0, 0);
    await expectCode(svc.transfer(ct.id, { targetZoneId: 'A' }, operator), 'VALIDATION');
  });
});

describe('undoMovement', () => {
  it('moves the container back, marks the movement undone, refuses a second undo', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 1, toCol: 2 }, operator);
    const mv = await prisma.movement.findFirstOrThrow({ where: { type: 'MOVE' } });
    const back = await svc.undoMovement(mv.id, operator);
    expect(back).toMatchObject({ zoneId: 'A', row: 0, col: 0, tier: 1, version: 3 });
    expect((await prisma.movement.findUniqueOrThrow({ where: { id: mv.id } })).undoneAt).not.toBeNull();
    expect(await outboxTypes()).toContain('yard.container.relocated');
    await expectCode(svc.undoMovement(mv.id, operator), 'RULE_VIOLATION', /déjà été annulé/);
  });

  it('refuses when the container moved again since', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 1, toCol: 2 }, operator);
    const mv = await prisma.movement.findFirstOrThrow({ where: { type: 'MOVE' } });
    await svc.move(ct.id, { toZoneId: 'B', toRow: 0, toCol: 0 }, operator);
    await expectCode(svc.undoMovement(mv.id, operator), 'RULE_VIOLATION');
  });
});

describe('compactZone', () => {
  it("packs 40' first, emits relocated only for containers that moved", async () => {
    const a = await arrive('FULL_40', 'A', 0, 0, { plannedExitDate: '2026-11-10' });
    const b = await arrive('FULL_20', 'A', 1, 2, { plannedExitDate: '2026-11-01' });
    const count = await svc.compactZone('A', operator);
    expect(count).toBe(1); // only b actually moved
    const after = await prisma.container.findMany({ where: { zoneId: 'A' } });
    expect(after.find((c) => c.id === a.id)).toMatchObject({ row: 0, col: 0, tier: 1, version: 1 });
    expect(after.find((c) => c.id === b.id)).toMatchObject({ row: 0, col: 1, tier: 1, version: 2 });
    const relocated = await prisma.outboxMessage.findMany({ where: { routingKey: 'yard.container.relocated' } });
    expect(relocated).toHaveLength(1);
    expect(await prisma.movement.count({ where: { type: 'COMPACT' } })).toBe(1);
  });

  it('returns 0 for an empty zone; compactAll sums all zones', async () => {
    expect(await svc.compactZone('B', operator)).toBe(0);
    await arrive('FULL_20', 'A', 1, 1);
    await arrive('FULL_20', 'B', 1, 1);
    expect(await svc.compactAll(operator)).toBe(2); // both moved to slot (0,0)
  });
});

describe('zones', () => {
  it('uppercases the id and refuses duplicates and bad dimensions', async () => {
    const z = await svc.createZone({ id: 'c', rows: 1, cols: 1 }, operator);
    expect(z).toMatchObject({ id: 'C', label: 'Zone C', version: 1 });
    await expectCode(svc.createZone({ id: 'C', rows: 1, cols: 1 }, operator), 'RULE_VIOLATION');
    await expectCode(svc.createZone({ id: 'D', rows: 0, cols: 1 }, operator), 'VALIDATION');
    await expectCode(svc.createZone({ id: 'TOOLONG', rows: 1, cols: 1 }, operator), 'VALIDATION');
  });

  it('refuses to shrink below occupied slots and to delete a non-empty zone', async () => {
    await arrive('FULL_20', 'A', 1, 2);
    await expectCode(svc.updateZone('A', { rows: 1 }, operator), 'RULE_VIOLATION', /réduire/);
    await expectCode(svc.deleteZone('A', operator), 'RULE_VIOLATION', /contient/);
  });

  it('VERSION_CONFLICT on a stale zone version; events for create/update/delete', async () => {
    await svc.updateZone('B', { label: 'Export', expectedVersion: 1 }, operator);
    await expectCode(svc.updateZone('B', { label: 'X', expectedVersion: 1 }, operator), 'VERSION_CONFLICT');
    await svc.deleteZone('B', operator);
    const types = await outboxTypes();
    expect(types.filter((t) => t === 'yard.zone.created')).toHaveLength(2);
    expect(types).toContain('yard.zone.updated');
    expect(types).toContain('yard.zone.deleted');
  });
});

describe('updateReefer', () => {
  it('updates settings, recomputes the alert, emits reefer.configured', async () => {
    const ct = await arrive('REEFER');
    const r = await svc.updateReefer(ct.id, { powerStatus: 'off' }, operator);
    expect(r.reefer).toMatchObject({ powerStatus: 'off', alert: true });
    expect((await outboxTypes()).filter((t) => t === 'yard.reefer.configured')).toHaveLength(2);
  });

  it('refuses on a non-reefer container', async () => {
    const ct = await arrive('FULL_20');
    await expectCode(svc.updateReefer(ct.id, { setPoint: 4 }, operator), 'RULE_VIOLATION');
  });
});
