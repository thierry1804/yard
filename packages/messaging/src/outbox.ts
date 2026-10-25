import type { Envelope } from '@ccis/contracts';

export interface OutboxRecord {
  id: string;
  exchange: string;
  routingKey: string;
  payload: Envelope;
}

export interface OutboxStore {
  claimBatch(limit: number, publish: (records: OutboxRecord[]) => Promise<void>): Promise<number>;
}

type SqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

export type PrismaLike = SqlClient & {
  $transaction<R>(fn: (tx: SqlClient) => Promise<R>): Promise<R>;
};

// Every service owns an identical `outbox` table (see each prisma/schema.prisma).
// Rows stay locked while they are published; if publishing throws, the
// transaction rolls back and the rows are retried on the next cycle.
export function prismaOutboxStore(prisma: PrismaLike): OutboxStore {
  return {
    async claimBatch(limit, publish) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<OutboxRecord[]>(
          `SELECT id, exchange, "routingKey", payload FROM outbox
           WHERE "publishedAt" IS NULL
           ORDER BY "createdAt", id
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          limit,
        );
        if (rows.length === 0) return 0;
        await publish(rows);
        await tx.$executeRawUnsafe(
          `UPDATE outbox SET "publishedAt" = now() WHERE id = ANY($1::uuid[])`,
          rows.map((r) => r.id),
        );
        return rows.length;
      });
    },
  };
}
