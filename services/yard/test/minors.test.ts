import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prismaOutboxStore, type PrismaLike } from '@ccis/messaging';
import { AppError } from '@ccis/service-kit';
import { Prisma, type PrismaClient } from '../src/generated/prisma';
import { buildYardApp } from '../src/app';
import { lockKeys, zoneCode } from '../src/locks';
import { YardService } from '../src/yard-service';
import { operator, prisma, resetDb } from './helpers';

const svc = new YardService(prisma);
const app = buildYardApp({ service: svc, logger: false });
const as = (role: 'ADMIN' | 'OPERATOR') => ({ 'x-user-id': `u-${role}`, 'x-user-role': role });

async function expectCode(p: Promise<unknown>, code: string, msg?: RegExp) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (msg) expect((err as AppError).message).toMatch(msg);
}

beforeEach(async () => {
  await resetDb();
  await svc.createZone({ id: 'A', rows: 2, cols: 3 }, operator);
  await svc.createZone({ id: 'B', rows: 2, cols: 2 }, operator);
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('zone ids are normalized on every route', () => {
  it('arrival, move, transfer and zone routes accept lowercase ids', async () => {
    const arr = await app.inject({ method: 'POST', url: '/containers/arrival', headers: as('OPERATOR'), payload: { type: 'FULL_20', zoneId: ' a ' } });
    expect(arr.statusCode).toBe(201);
    const ct = arr.json();
    expect(ct.zoneId).toBe('A');
    const mv = await app.inject({ method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'), payload: { toZoneId: 'b', toRow: 0, toCol: 0 } });
    expect(mv.json().zoneId).toBe('B');
    const tr = await app.inject({ method: 'POST', url: `/containers/${ct.id}/transfer`, headers: as('OPERATOR'), payload: { targetZoneId: 'a' } });
    expect(tr.json().zoneId).toBe('A');
    expect((await app.inject({ method: 'PATCH', url: '/zones/b', headers: as('ADMIN'), payload: { label: 'Export' } })).json().label).toBe('Export');
    expect((await app.inject({ url: '/containers?zoneId=a', headers: as('OPERATOR') })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: '/zones/a/compact', headers: as('OPERATOR') })).statusCode).toBe(409);
  });
});

describe('plannedExitDate validation', () => {
  it.each(['2026-02-31', '12/31/2026', '1', '2026-13-01'])('rejects %s', async (d) => {
    await expectCode(svc.arrival({ type: 'FULL_20', zoneId: 'A', plannedExitDate: d }, operator), 'VALIDATION');
  });
  it('accepts a calendar date and a full ISO timestamp', async () => {
    const a = await svc.arrival({ type: 'FULL_20', zoneId: 'A', plannedExitDate: '2026-11-15' }, operator);
    expect(a.plannedExitDate?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    const b = await svc.arrival({ type: 'FULL_20', zoneId: 'A', plannedExitDate: '2026-11-15T10:30:00.000Z' }, operator);
    expect(b.plannedExitDate?.toISOString()).toBe('2026-11-15T10:30:00.000Z');
  });
});

describe('transaction failures', () => {
  function fakePrisma(errors: unknown[]) {
    let calls = 0;
    return {
      calls: () => calls,
      client: {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
          calls++;
          const err = errors.shift();
          if (err) throw err;
          return fn(prisma);
        },
      } as unknown as PrismaClient,
    };
  }
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '6' });

  it('retries a deadlock / write conflict, then succeeds', async () => {
    const fake = fakePrisma([known('P2034'), known('P2034')]);
    const s = new YardService(fake.client);
    const zone = await s.createZone({ id: 'C', rows: 1, cols: 1 }, operator);
    expect(zone.id).toBe('C');
    expect(fake.calls()).toBe(3);
  });

  it('maps a lock/pool wait timeout to 503 SERVICE_UNAVAILABLE', async () => {
    const s = new YardService(fakePrisma([known('P2028')]).client);
    await expectCode(s.createZone({ id: 'D', rows: 1, cols: 1 }, operator), 'SERVICE_UNAVAILABLE');
  });
});

describe('updateReefer concurrency and versions', () => {
  it('bumps the container version, accepts expectedVersion, rejects stale ones', async () => {
    const ct = await svc.arrival({ type: 'REEFER', zoneId: 'A' }, operator);
    const a = await svc.updateReefer(ct.id, { setPoint: 4, expectedVersion: 1 }, operator);
    expect(a.version).toBe(2);
    await expectCode(svc.updateReefer(ct.id, { setPoint: 5, expectedVersion: 1 }, operator), 'VERSION_CONFLICT');
    const versions = (await prisma.outboxMessage.findMany({ where: { routingKey: 'yard.reefer.configured' }, orderBy: { createdAt: 'asc' } }))
      .map((r) => (r.payload as { aggregateVersion: number }).aggregateVersion);
    expect(versions).toEqual([1, 2]);
  });

  it('concurrent patches of different fields are both kept', async () => {
    const ct = await svc.arrival({ type: 'REEFER', zoneId: 'A' }, operator);
    await Promise.all([
      svc.updateReefer(ct.id, { commodity: 'Vaccins' }, operator),
      svc.updateReefer(ct.id, { powerStatus: 'off' }, operator),
    ]);
    const r = await prisma.reeferState.findUniqueOrThrow({ where: { containerId: ct.id } });
    expect(r).toMatchObject({ commodity: 'Vaccins', powerStatus: 'off' });
  });

  it('rejects tempMin above tempMax', async () => {
    const ct = await svc.arrival({ type: 'REEFER', zoneId: 'A' }, operator);
    await expectCode(svc.updateReefer(ct.id, { tempMin: 10, tempMax: 2 }, operator), 'VALIDATION');
  });
});

describe('outbox purge', () => {
  it('deletes published rows older than the retention, keeps recent and unpublished ones', async () => {
    const day = 86_400_000;
    await prisma.outboxMessage.updateMany({ data: { publishedAt: new Date(Date.now() - 8 * day) } });
    await svc.createZone({ id: 'C', rows: 1, cols: 1 }, operator);
    await prisma.outboxMessage.updateMany({ where: { publishedAt: null, routingKey: 'yard.zone.created' }, data: { publishedAt: new Date(Date.now() - day) } });
    await svc.createZone({ id: 'D', rows: 1, cols: 1 }, operator);
    const store = prismaOutboxStore(prisma as unknown as PrismaLike);
    expect(await store.purgePublished(7)).toBe(2);
    expect(await prisma.outboxMessage.count()).toBe(2);
  });
});

describe('advisory lock keys', () => {
  it('encodes zone ids injectively into positive int4 values', () => {
    const ids = ['A', 'B', 'Z', '0', '9', 'AA', 'A0', 'ZZZZ', '9999', 'R'];
    const codes = ids.map(zoneCode);
    expect(new Set(codes).size).toBe(ids.length);
    for (const c of codes) expect(c).toBeGreaterThan(0);
    expect(zoneCode('ZZZZ')).toBeLessThan(2 ** 31);
  });
  it('zone and slot keys never collide', () => {
    const zone = lockKeys.zone('A');
    const slot = lockKeys.slot('A', 0, 0);
    expect(zone).not.toEqual(slot);
    expect(lockKeys.slot('A', 1, 2)).not.toEqual(lockKeys.slot('A', 2, 1));
  });
});

describe('undo checks history', () => {
  it('refuses to undo a move followed by later moves, even if the container came back', async () => {
    const ct = await svc.arrival({ type: 'FULL_20', zoneId: 'A', row: 0, col: 0 }, operator);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 1 }, operator);
    const first = await prisma.movement.findFirstOrThrow({ where: { type: 'MOVE' } });
    await svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 2 }, operator);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 1 }, operator);
    await expectCode(svc.undoMovement(first.id, operator), 'RULE_VIOLATION', /déplacé depuis/);
  });
});

describe('more concurrency', () => {
  it('two concurrent moves of the same container: exactly one wins', async () => {
    const ct = await svc.arrival({ type: 'FULL_20', zoneId: 'A', row: 0, col: 0 }, operator);
    const results = await Promise.allSettled([
      svc.move(ct.id, { toZoneId: 'A', toRow: 1, toCol: 1, expectedVersion: 1 }, operator),
      svc.move(ct.id, { toZoneId: 'B', toRow: 1, toCol: 1, expectedVersion: 1 }, operator),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.movement.count({ where: { type: 'MOVE' } })).toBe(1);
  });

  it('departure and arrival on the same stack at the same time keep tiers consistent', async () => {
    const bottom = await svc.arrival({ type: 'FULL_20', zoneId: 'A', row: 1, col: 1 }, operator);
    const top = await svc.arrival({ type: 'FULL_20', zoneId: 'A', row: 1, col: 1 }, operator);
    await Promise.allSettled([
      svc.departure(top.id, {}, operator),
      svc.arrival({ type: 'FULL_20', zoneId: 'A', row: 1, col: 1 }, operator),
    ]);
    const tiers = (await prisma.container.findMany({ where: { zoneId: 'A', row: 1, col: 1, status: 'PRESENT' }, orderBy: { tier: 'asc' } })).map((c) => c.tier);
    expect(tiers[0]).toBe(1);
    expect(new Set(tiers).size).toBe(tiers.length);
    expect(bottom.tier).toBe(1);
  });

  it('compaction and a move at the same time never leave two containers in one slot tier', async () => {
    const cts = [];
    for (const [r, c] of [[0, 2], [1, 0], [1, 2]]) cts.push(await svc.arrival({ type: 'FULL_20', zoneId: 'A', row: r, col: c }, operator));
    await Promise.allSettled([
      svc.compactZone('A', operator),
      svc.move(cts[0].id, { toZoneId: 'A', toRow: 0, toCol: 0 }, operator),
    ]);
    const present = await prisma.container.findMany({ where: { zoneId: 'A', status: 'PRESENT' } });
    const keys = present.map((c) => `${c.row}:${c.col}:${c.tier}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(present.every((c) => c.row >= 0)).toBe(true);
  });
});

describe('compaction', () => {
  it('compactAll is all-or-nothing across zones', async () => {
    await svc.createZone({ id: 'F', rows: 1, cols: 2 }, operator);
    for (const c of [0, 1]) {
      await svc.arrival({ type: 'FULL_40', zoneId: 'F', row: 0, col: c }, operator);
      await svc.arrival({ type: 'FULL_40', zoneId: 'F', row: 0, col: c }, operator);
      await svc.arrival({ type: 'FULL_20', zoneId: 'F', row: 0, col: c }, operator);
    }
    const loose = await svc.arrival({ type: 'FULL_20', zoneId: 'A', row: 1, col: 2 }, operator);
    await expectCode(svc.compactAll(operator), 'RULE_VIOLATION', /trop pleine/);
    const after = await prisma.container.findUniqueOrThrow({ where: { id: loose.id } });
    expect(after).toMatchObject({ row: 1, col: 2 });
  });
});
