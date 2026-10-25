import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildYardApp } from '../src/app';
import { YardService } from '../src/yard-service';
import { prisma, resetDb } from './helpers';

const app = buildYardApp({ service: new YardService(prisma), logger: false });
const op = { 'x-user-id': 'u-op', 'x-user-role': 'OPERATOR', 'x-user-email': 'operateur@ccis.mg' };
const admin = { 'x-user-id': 'u-admin', 'x-user-role': 'ADMIN', 'x-user-email': 'admin@ccis.mg' };
const viewer = { 'x-user-id': 'u-view', 'x-user-role': 'VIEWER' };

async function post(url: string, headers: Record<string, string>, payload?: unknown) {
  const res = await app.inject({ method: 'POST', url, headers, payload: payload as never });
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json();
}

beforeEach(async () => {
  await resetDb();
  await post('/zones', admin, { id: 'A', rows: 2, cols: 3 });
  await post('/zones', admin, { id: 'B', rows: 2, cols: 2 });
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('GET /containers/:id/history', () => {
  it('returns every visit of the container number, newest first, with chronological movements and authors', async () => {
    // First visit: arrival, move (then undone by admin), departure.
    const v1 = await post('/containers/arrival', op, { containerNo: 'MSCU1234567', type: 'FULL_20', zoneId: 'A', row: 0, col: 0, client: 'Star' });
    await post(`/containers/${v1.id}/move`, op, { toZoneId: 'B', toRow: 1, toCol: 1 });
    const moves = await app.inject({ url: '/movements?take=10', headers: viewer });
    const moveId = moves.json().find((m: { type: string }) => m.type === 'MOVE').id;
    await post(`/movements/${moveId}/undo`, admin);
    await post(`/containers/${v1.id}/departure`, op);
    // Second visit of the same number.
    const v2 = await post('/containers/arrival', op, { containerNo: 'MSCU1234567', type: 'FULL_40', zoneId: 'B', row: 0, col: 0 });
    await post(`/containers/${v2.id}/transfer`, admin, { targetZoneId: 'A' });

    const res = await app.inject({ url: '/containers/mscu1234567/history', headers: viewer });
    expect(res.statusCode).toBe(200);
    const h = res.json();
    expect(h.containerNo).toBe('MSCU1234567');
    expect(h.visits.map((v: { containerId: string }) => v.containerId)).toEqual([v2.id, v1.id]);

    const [current, past] = h.visits;
    expect(current).toMatchObject({ status: 'PRESENT', type: 'FULL_40', exitDate: null });
    expect(current.movements.map((m: { type: string }) => m.type)).toEqual(['ARRIVAL', 'TRANSFER']);
    expect(current.movements[1]).toMatchObject({
      from: { zoneId: 'B', row: 0, col: 0, tier: 1 },
      to: { zoneId: 'A', row: 0, col: 0, tier: 1 },
      userEmail: 'admin@ccis.mg',
    });

    expect(past).toMatchObject({ status: 'DEPARTED', type: 'FULL_20', client: 'Star' });
    expect(past.exitDate).not.toBeNull();
    expect(past.movements.map((m: { type: string }) => m.type)).toEqual(['ARRIVAL', 'MOVE', 'DEPARTURE']);
    expect(past.movements[0]).toMatchObject({ from: null, to: { zoneId: 'A', row: 0, col: 0, tier: 1 }, userEmail: 'operateur@ccis.mg' });
    expect(past.movements[1]).toMatchObject({ undoneByEmail: 'admin@ccis.mg' });
    expect(past.movements[1].undoneAt).not.toBeNull();
    expect(past.movements[2]).toMatchObject({ from: { zoneId: 'A', row: 0, col: 0, tier: 1 }, to: null });
  });

  it('accepts the container uuid as well', async () => {
    const ct = await post('/containers/arrival', op, { type: 'FULL_20', zoneId: 'A' });
    const res = await app.inject({ url: `/containers/${ct.id}/history`, headers: viewer });
    expect(res.json().visits).toHaveLength(1);
  });

  it('404 for an unknown container, 401 without identity', async () => {
    expect((await app.inject({ url: '/containers/TCLU0000000/history', headers: viewer })).statusCode).toBe(404);
    expect((await app.inject({ url: '/containers/TCLU0000000/history' })).statusCode).toBe(401);
  });
});
