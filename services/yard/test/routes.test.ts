import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseEnvelope } from '@ccis/contracts';
import { buildYardApp } from '../src/app';
import { YardService } from '../src/yard-service';
import { prisma, resetDb } from './helpers';

const app = buildYardApp({ service: new YardService(prisma), logger: false });
const as = (role: 'ADMIN' | 'OPERATOR' | 'VIEWER') => ({ 'x-user-id': `u-${role}`, 'x-user-role': role });

beforeEach(async () => {
  await resetDb();
  await app.inject({ method: 'POST', url: '/zones', headers: as('ADMIN'), payload: { id: 'A', label: 'Zone A', rows: 2, cols: 2 } });
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

async function arrive(payload: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/containers/arrival', headers: as('OPERATOR'), payload: { type: 'FULL_20', zoneId: 'A', ...payload } });
}

describe('authorization', () => {
  it('401 without identity, 403 for a VIEWER writing, 403 for an OPERATOR managing zones', async () => {
    expect((await app.inject({ url: '/containers' })).statusCode).toBe(401);
    const viewer = await app.inject({ method: 'POST', url: '/containers/arrival', headers: as('VIEWER'), payload: { type: 'FULL_20', zoneId: 'A' } });
    expect(viewer.statusCode).toBe(403);
    const op = await app.inject({ method: 'POST', url: '/zones', headers: as('OPERATOR'), payload: { id: 'B', rows: 1, cols: 1 } });
    expect(op.statusCode).toBe(403);
  });
});

describe('containers', () => {
  it('arrival returns 201 with the frontend shape, GET lists it', async () => {
    const res = await arrive({ client: 'Star', weightKg: 12000, plannedExitDate: '2026-11-15' });
    expect(res.statusCode).toBe(201);
    const ct = res.json();
    expect(ct).toMatchObject({ zoneId: 'A', row: 0, col: 0, tier: 1, client: 'Star', weightKg: 12000, version: 1, reefer: null, customsStatus: 'RELEASED' });
    expect(ct.plannedExitDate).toBe('2026-11-15T00:00:00.000Z');
    const list = await app.inject({ url: '/containers', headers: as('VIEWER') });
    expect(list.json()).toHaveLength(1);
  });

  it('reefer fields use the names the frontend expects', async () => {
    const ct = (await arrive({ type: 'REEFER' })).json();
    expect(Object.keys(ct.reefer).sort()).toEqual(
      ['commodity', 'currentTemp', 'humidity', 'lastTempUpdate', 'powerStatus', 'setPoint', 'tempAlert', 'tempMax', 'tempMin', 'ventSetting'],
    );
  });

  it('invalid plannedExitDate → 400 VALIDATION, unknown type → 400', async () => {
    expect((await arrive({ plannedExitDate: 'demain' })).json()).toMatchObject({ code: 'VALIDATION' });
    expect((await arrive({ type: 'BOAT' })).statusCode).toBe(400);
  });

  it('departure without body is accepted', async () => {
    const ct = (await arrive()).json();
    const res = await app.inject({ method: 'POST', url: `/containers/${ct.id}/departure`, headers: as('OPERATOR') });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('DEPARTED');
  });

  it('move with a stale expectedVersion → 409 VERSION_CONFLICT', async () => {
    const ct = (await arrive()).json();
    await app.inject({ method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'), payload: { toZoneId: 'A', toRow: 1, toCol: 1 } });
    const res = await app.inject({
      method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'),
      payload: { toZoneId: 'A', toRow: 0, toCol: 1, expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('VERSION_CONFLICT');
  });

  it('GET /containers/:id accepts the container number', async () => {
    const ct = (await arrive({ containerNo: 'MSCU1234567' })).json();
    const res = await app.inject({ url: '/containers/MSCU1234567', headers: as('VIEWER') });
    expect(res.json().id).toBe(ct.id);
  });

  it('propagates x-correlation-id into the outbox envelope', async () => {
    await app.inject({
      method: 'POST', url: '/containers/arrival', headers: { ...as('OPERATOR'), 'x-correlation-id': 'corr-from-gateway' },
      payload: { type: 'FULL_20', zoneId: 'A' },
    });
    const row = await prisma.outboxMessage.findFirstOrThrow({ where: { routingKey: 'yard.container.arrived' } });
    expect(parseEnvelope(row.payload)).toMatchObject({ correlationId: 'corr-from-gateway', actor: { userId: 'u-OPERATOR', role: 'OPERATOR' } });
  });
});

describe('zones, compaction and movements', () => {
  it('zone CRUD with versions', async () => {
    const z = await app.inject({ method: 'PATCH', url: '/zones/A', headers: as('ADMIN'), payload: { label: 'Import', expectedVersion: 1 } });
    expect(z.json()).toMatchObject({ id: 'A', label: 'Import', version: 2 });
    expect((await app.inject({ method: 'DELETE', url: '/zones/A', headers: as('ADMIN') })).statusCode).toBe(204);
    expect((await app.inject({ url: '/zones', headers: as('VIEWER') })).json()).toEqual([]);
  });

  it('compact routes return counts; compact-all is not taken as a zone id', async () => {
    await arrive({ row: 1, col: 1 });
    expect((await app.inject({ method: 'POST', url: '/zones/A/compact', headers: as('OPERATOR') })).json()).toEqual({ count: 1 });
    expect((await app.inject({ method: 'POST', url: '/zones/compact-all', headers: as('OPERATOR') })).json()).toEqual({ total: 1 });
  });

  it('movements list with embedded container, newest first, and undo', async () => {
    const ct = (await arrive()).json();
    await app.inject({ method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'), payload: { toZoneId: 'A', toRow: 1, toCol: 1 } });
    const list = (await app.inject({ url: '/movements?take=10', headers: as('VIEWER') })).json();
    expect(list.map((m: { type: string }) => m.type)).toEqual(['MOVE', 'ARRIVAL']);
    expect(list[0].container).toEqual({ id: ct.id, containerNo: ct.containerNo, type: 'FULL_20' });
    const undo = await app.inject({ method: 'POST', url: `/movements/${list[0].id}/undo`, headers: as('OPERATOR') });
    expect(undo.json()).toMatchObject({ row: 0, col: 0 });
  });
});

describe('invalid input never yields a 500', () => {
  it('undo with a non-uuid id → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/movements/abc/undo', headers: as('OPERATOR') });
    expect(res.statusCode).toBe(404);
  });

  it('unknown container type filter → 400', async () => {
    const res = await app.inject({ url: '/containers?type=bogus', headers: as('VIEWER') });
    expect(res.statusCode).toBe(400);
  });

  it('absurd weight → 400', async () => {
    const res = await arrive({ weightKg: 3_000_000_000 });
    expect(res.statusCode).toBe(400);
  });

  it('container lookup with a NUL byte → 404; lowercase number is found', async () => {
    expect((await app.inject({ url: '/containers/%00', headers: as('VIEWER') })).statusCode).toBe(404);
    const ct = (await arrive({ containerNo: 'MSCU7654321' })).json();
    const res = await app.inject({ url: '/containers/mscu7654321', headers: as('VIEWER') });
    expect(res.json().id).toBe(ct.id);
  });
});
