import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { PrismaClient } from '../src/generated/prisma';
import { buildAuthApp } from '../src/app';
import { hashPassword } from '../src/passwords';
import { createTokenSigner } from '../src/tokens';
import { FixedWindowLimiter } from '../src/rate-limiter';

const prisma = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
let publicPem: string;
let privatePem: string;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  privatePem = await exportPKCS8(privateKey);
  publicPem = await exportSPKI(publicKey);
});
afterAll(async () => { await prisma.$disconnect(); });

beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: { email: 'op@ccis.mg', name: 'Op', role: 'OPERATOR', passwordHash: await hashPassword('secret123') },
  });
  await prisma.user.create({
    data: { email: 'gone@ccis.mg', name: 'Gone', role: 'VIEWER', active: false, passwordHash: await hashPassword('secret123') },
  });
});

async function app(limiter = new FixedWindowLimiter(100, 60_000)) {
  return buildAuthApp({ prisma, signer: await createTokenSigner(privatePem), limiter, logger: false });
}

const login = (a: Awaited<ReturnType<typeof app>>, email: string, password: string, ip = '10.0.0.1') =>
  a.inject({ method: 'POST', url: '/auth/login', payload: { email, password }, headers: { 'x-forwarded-for': ip } });

describe('POST /auth/login', () => {
  it('returns a verifiable RS256 token and the public user', async () => {
    const res = await login(await app(), 'OP@ccis.mg', 'secret123');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ email: 'op@ccis.mg', role: 'OPERATOR' });
    expect(body.user.passwordHash).toBeUndefined();
    const { payload } = await jwtVerify(body.accessToken, await importSPKI(publicPem, 'RS256'), { issuer: 'ccis-auth' });
    expect(payload.sub).toBe(body.user.id);
    expect(payload.role).toBe('OPERATOR');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(12 * 3600);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'op@ccis.mg' } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  it('same 401 message for wrong password, unknown email and inactive account', async () => {
    const a = await app();
    for (const [email, pw] of [['op@ccis.mg', 'nope'], ['who@ccis.mg', 'secret123'], ['gone@ccis.mg', 'secret123']]) {
      const res = await login(a, email, pw);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED', error: 'Email ou mot de passe incorrect.' });
    }
  });

  it('400 on malformed body', async () => {
    const res = await (await app()).inject({ method: 'POST', url: '/auth/login', payload: { email: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION');
  });

  it('429 after 5 attempts per minute for the same email, even from different IPs', async () => {
    const a = await app(new FixedWindowLimiter(5, 60_000));
    for (let i = 0; i < 5; i++) await login(a, 'op@ccis.mg', 'nope', `10.0.0.${i}`);
    const res = await login(a, 'op@ccis.mg', 'secret123', '10.0.0.99');
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('RATE_LIMITED');
  });

  it('429 after 5 attempts per minute from the same IP, even for different emails', async () => {
    const a = await app(new FixedWindowLimiter(5, 60_000));
    for (let i = 0; i < 5; i++) await login(a, `u${i}@ccis.mg`, 'nope', '10.9.9.9');
    expect((await login(a, 'op@ccis.mg', 'secret123', '10.9.9.9')).statusCode).toBe(429);
  });
});

describe('GET /auth/me', () => {
  it('returns the user identified by the gateway headers', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'op@ccis.mg' } });
    const res = await (await app()).inject({ url: '/auth/me', headers: { 'x-user-id': user.id, 'x-user-role': 'OPERATOR' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: user.id, email: 'op@ccis.mg', name: 'Op', role: 'OPERATOR' });
  });

  it('401 without identity or for an inactive user', async () => {
    const a = await app();
    expect((await a.inject({ url: '/auth/me' })).statusCode).toBe(401);
    const gone = await prisma.user.findUniqueOrThrow({ where: { email: 'gone@ccis.mg' } });
    expect((await a.inject({ url: '/auth/me', headers: { 'x-user-id': gone.id, 'x-user-role': 'VIEWER' } })).statusCode).toBe(401);
  });
});
