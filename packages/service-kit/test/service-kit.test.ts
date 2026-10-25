import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp, errors, redactUrl, requireRole } from '../src/index';

function app() {
  const a = createApp({ service: 'test', logger: false, checks: { ok: async () => {} } });
  a.get('/boom/app', async () => { throw errors.ruleViolation('Pile pleine.'); });
  a.get('/boom/zod', async () => z.object({ rows: z.number() }).parse({ rows: 'x' }));
  a.get('/boom/crash', async () => { throw new Error('secret detail'); });
  a.get('/admin', { preHandler: requireRole('ADMIN') }, async (req) => ({ user: req.identity }));
  return a;
}

describe('error handler', () => {
  it('formats AppError with code and correlationId', async () => {
    const res = await app().inject({ url: '/boom/app', headers: { 'x-correlation-id': 'corr-42' } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Pile pleine.', code: 'RULE_VIOLATION', correlationId: 'corr-42' });
    expect(res.headers['x-correlation-id']).toBe('corr-42');
  });

  it('turns zod errors into 400 VALIDATION', async () => {
    const res = await app().inject({ url: '/boom/zod' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION');
    expect(res.json().error).toContain('rows');
  });

  it('hides internal errors', async () => {
    const res = await app().inject({ url: '/boom/crash' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'INTERNAL', error: 'Erreur interne du serveur.' });
    expect(res.body).not.toContain('secret');
  });

  it('generates a correlation id when none is given', async () => {
    const res = await app().inject({ url: '/boom/app' });
    expect(res.json().correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await app().inject({ url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('requireRole', () => {
  it('401 without identity headers', async () => {
    const res = await app().inject({ url: '/admin' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('403 when the role is too low', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'OPERATOR' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('ADMIN');
  });

  it('401 on an unknown role value', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'ROOT' } });
    expect(res.statusCode).toBe(401);
  });

  it('includes the email forwarded by the gateway', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'ADMIN', 'x-user-email': 'a@ccis.mg' } });
    expect(res.json()).toEqual({ user: { userId: 'u1', role: 'ADMIN', email: 'a@ccis.mg' } });
  });

  it('exposes the identity when allowed', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'ADMIN' } });
    expect(res.json()).toEqual({ user: { userId: 'u1', role: 'ADMIN' } });
  });
});

describe('health', () => {
  it('live and ready', async () => {
    const a = app();
    expect((await a.inject({ url: '/health/live' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/health/ready' })).json()).toEqual({ ok: true, checks: { ok: 'ok' } });
  });

  it('ready returns 503 when a check fails', async () => {
    const a = createApp({ service: 't', logger: false, checks: { db: async () => { throw new Error('down'); } } });
    const res = await a.inject({ url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, checks: { db: 'down' } });
  });
});

describe('redactUrl', () => {
  it('masks token and ticket query params', () => {
    expect(redactUrl('/ws?ticket=abc&x=1')).toBe('/ws?ticket=***&x=1');
    expect(redactUrl('/ws?x=1&token=abc')).toBe('/ws?x=1&token=***');
    expect(redactUrl('/zones')).toBe('/zones');
  });
});
