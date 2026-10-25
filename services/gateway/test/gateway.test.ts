import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildGatewayApp } from '../src/app';
import { Hub } from '../src/hub';
import { TicketStore } from '../src/tickets';
import { createTokenVerifier } from '../src/verify';
import { testKeys } from './keys';

let upstream: FastifyInstance;
let upstreamUrl: string;
let gw: FastifyInstance;
let gwUrl: string;
let keys: Awaited<ReturnType<typeof testKeys>>;
const hub = new Hub();
const seen: { headers: Record<string, unknown>; body: unknown; url: string; method: string }[] = [];

beforeAll(async () => {
  keys = await testKeys();
  upstream = Fastify();
  upstream.all('/*', async (req, reply) => {
    seen.push({ headers: req.headers, body: req.body, url: req.url, method: req.method });
    if (req.url.startsWith('/zones/missing')) return reply.code(404).send({ error: 'Zone missing introuvable.', code: 'NOT_FOUND' });
    if (req.method === 'DELETE') return reply.code(204).send();
    return { ok: true, url: req.url };
  });
  await upstream.listen({ port: 0, host: '127.0.0.1' });
  upstreamUrl = `http://127.0.0.1:${(upstream.server.address() as { port: number }).port}`;

  gw = await buildGatewayApp({
    verify: await createTokenVerifier(keys.publicPem),
    services: { auth: { name: 'auth', url: upstreamUrl }, yard: { name: 'yard', url: upstreamUrl } },
    tickets: new TicketStore(),
    hub,
    corsOrigin: ['http://127.0.0.1:5180'],
    logger: false,
  });
  await gw.listen({ port: 0, host: '127.0.0.1' });
  gwUrl = `http://127.0.0.1:${(gw.server.address() as { port: number }).port}`;
});
afterAll(async () => { await gw.close(); await upstream.close(); });

const bearer = async (role = 'OPERATOR') => ({ authorization: `Bearer ${await keys.sign('user-1', role)}` });

describe('authentication', () => {
  it('401 without token, with a bad token, with a wrong issuer, with an expired token', async () => {
    expect((await gw.inject({ url: '/containers' })).json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await gw.inject({ url: '/containers', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    const wrongIss = await keys.sign('u', 'ADMIN', '1h', 'someone-else');
    expect((await gw.inject({ url: '/containers', headers: { authorization: `Bearer ${wrongIss}` } })).statusCode).toBe(401);
    const expired = await keys.sign('u', 'ADMIN', '-1s');
    expect((await gw.inject({ url: '/containers', headers: { authorization: `Bearer ${expired}` } })).statusCode).toBe(401);
  });

  it('/auth/login is public and forwards x-forwarded-for', async () => {
    seen.length = 0;
    const res = await gw.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.c', password: 'x' }, remoteAddress: '10.1.2.3' });
    expect(res.statusCode).toBe(200);
    expect(seen[0].headers['x-forwarded-for']).toBe('10.1.2.3');
    expect(seen[0].body).toEqual({ email: 'a@b.c', password: 'x' });
  });
});

describe('forwarding', () => {
  it('ignores a client-supplied X-Forwarded-For (rate limiting relies on the real address)', async () => {
    seen.length = 0;
    await gw.inject({
      method: 'POST', url: '/auth/login', payload: { email: 'a@b.c', password: 'x' },
      remoteAddress: '10.1.2.3', headers: { 'x-forwarded-for': '6.6.6.6' },
    });
    expect(seen[0].headers['x-forwarded-for']).toBe('10.1.2.3');
  });

  it('injects identity, drops spoofed identity headers, propagates the correlation id', async () => {
    seen.length = 0;
    const res = await gw.inject({
      method: 'POST', url: '/containers/abc/move?x=1',
      headers: { ...(await bearer()), 'x-user-role': 'ADMIN', 'x-correlation-id': 'corr-9' },
      payload: { toZoneId: 'A', toRow: 0, toCol: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(seen[0]).toMatchObject({ url: '/containers/abc/move?x=1', method: 'POST', body: { toZoneId: 'A', toRow: 0, toCol: 0 } });
    expect(seen[0].headers['x-user-id']).toBe('user-1');
    expect(seen[0].headers['x-user-role']).toBe('OPERATOR');
    expect(seen[0].headers['x-correlation-id']).toBe('corr-9');
    expect(seen[0].headers.authorization).toBeUndefined();
  });

  it('relays upstream status and body, including 404 and 204', async () => {
    const notFound = await gw.inject({ url: '/zones/missing', headers: await bearer() });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ code: 'NOT_FOUND' });
    const del = await gw.inject({ method: 'DELETE', url: '/zones/A', headers: await bearer('ADMIN') });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe('');
  });

  it('503 SERVICE_UNAVAILABLE when the upstream is down', async () => {
    const down = await buildGatewayApp({
      verify: await createTokenVerifier(keys.publicPem),
      services: { auth: { name: 'auth', url: 'http://127.0.0.1:1' }, yard: { name: 'yard', url: 'http://127.0.0.1:1' } },
      tickets: new TicketStore(), hub: new Hub(), corsOrigin: [], logger: false,
    });
    const res = await down.inject({ url: '/zones', headers: await bearer() });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(res.json().error).toContain('yard');
  });
});

describe('websocket', () => {
  function connect(ticket: string): Promise<{ ws: WebSocket; frames: unknown[]; closed: Promise<number> }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${gwUrl.replace('http', 'ws')}/ws?ticket=${ticket}`);
      const frames: unknown[] = [];
      const closed = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
      ws.addEventListener('message', (e) => frames.push(JSON.parse(String(e.data))));
      ws.addEventListener('open', () => resolve({ ws, frames, closed }));
      ws.addEventListener('error', () => resolve({ ws, frames, closed }));
      setTimeout(() => reject(new Error('ws timeout')), 5000);
    });
  }

  it('a ticket opens a socket that receives broadcasts; the same ticket is refused with 4401', async () => {
    const { ticket } = (await gw.inject({ method: 'POST', url: '/ws-ticket', headers: await bearer() })).json();
    const first = await connect(ticket);
    await new Promise((r) => setTimeout(r, 50));
    hub.broadcast({ event: 'yard.container.moved', data: { id: 'x' }, at: '2026-10-25T00:00:00.000Z' });
    await new Promise((r) => setTimeout(r, 100));
    expect(first.frames).toEqual([{ event: 'yard.container.moved', data: { id: 'x' }, at: '2026-10-25T00:00:00.000Z' }]);

    const second = await connect(ticket);
    expect(await second.closed).toBe(4401);
    first.ws.close();
  });

  it('/ws-ticket requires authentication', async () => {
    expect((await gw.inject({ method: 'POST', url: '/ws-ticket' })).statusCode).toBe(401);
  });
});
