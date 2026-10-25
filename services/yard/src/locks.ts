import type { Prisma } from './generated/prisma';

type Tx = Prisma.TransactionClient;

// Transaction-scoped advisory locks. Zones first, then slots, each in sorted
// order, so concurrent transactions always acquire locks in the same order.
// Slot operations take the zone lock in shared mode; operations that scan or
// rewrite a whole zone (compaction, auto-placement, resize, delete) take it
// exclusively.
export async function lockZones(tx: Tx, zones: { zoneId: string; mode: 'shared' | 'exclusive' }[]): Promise<void> {
  const byZone = new Map<string, 'shared' | 'exclusive'>();
  for (const z of zones) {
    if (byZone.get(z.zoneId) !== 'exclusive') byZone.set(z.zoneId, z.mode);
  }
  for (const zoneId of [...byZone.keys()].sort()) {
    const fn = byZone.get(zoneId) === 'exclusive' ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared';
    await tx.$queryRawUnsafe(`SELECT 1 AS locked FROM ${fn}(hashtext($1))`, `zone:${zoneId}`);
  }
}

export async function lockSlots(tx: Tx, slots: { zoneId: string; row: number; col: number }[]): Promise<void> {
  const keys = [...new Set(slots.map((s) => `slot:${s.zoneId}:${s.row}:${s.col}`))].sort();
  for (const key of keys) {
    await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))', key);
  }
}
