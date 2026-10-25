import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prismaOutboxStore, type PrismaLike } from '@ccis/messaging';
import { YardService } from '../src/yard-service';
import { operator, prisma, resetDb } from './helpers';

const store = prismaOutboxStore(prisma as unknown as PrismaLike);

beforeEach(async () => {
  await resetDb();
  await new YardService(prisma).createZone({ id: 'A', rows: 1, cols: 1 }, operator);
});
afterAll(async () => { await prisma.$disconnect(); });

describe('prismaOutboxStore', () => {
  it('hands unpublished rows to publish, then marks them published', async () => {
    const seen: string[] = [];
    const n = await store.claimBatch(10, async (records) => { seen.push(...records.map((r) => r.payload.type)); });
    expect(n).toBe(1);
    expect(seen).toEqual(['yard.zone.created']);
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(0);
    expect(await store.claimBatch(10, async () => {})).toBe(0);
  });

  it('keeps rows unpublished when publish throws', async () => {
    await expect(store.claimBatch(10, async () => { throw new Error('broker down'); })).rejects.toThrow('broker down');
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(1);
  });
});
