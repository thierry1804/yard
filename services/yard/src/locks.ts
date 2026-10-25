import type { Prisma } from './generated/prisma';

type Tx = Prisma.TransactionClient;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Bijective base-37 encoding of a zone id (1–4 chars of [0-9A-Z]): injective
// and always in 1..1 874 160, so lock keys never collide (no hashing).
export function zoneCode(id: string): number {
  let n = 0;
  for (const ch of id) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`Identifiant de zone invalide pour un verrou : ${id}`);
    n = n * 37 + digit + 1;
  }
  return n;
}

// Two-int advisory lock keys: (0, zone) for zones, (zone, row*1000+col) for
// slots. Zone codes are ≥ 1, so the two families never overlap.
export const lockKeys = {
  zone: (zoneId: string): [number, number] => [0, zoneCode(zoneId)],
  slot: (zoneId: string, row: number, col: number): [number, number] => [zoneCode(zoneId), row * 1000 + col],
};

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
    const [a, b] = lockKeys.zone(zoneId);
    await tx.$queryRawUnsafe(`SELECT 1 AS locked FROM ${fn}($1::int, $2::int)`, a, b);
  }
}

export async function lockSlots(tx: Tx, slots: { zoneId: string; row: number; col: number }[]): Promise<void> {
  const unique = new Map(slots.map((s) => [`${s.zoneId}:${s.row}:${s.col}`, s]));
  for (const key of [...unique.keys()].sort()) {
    const s = unique.get(key)!;
    const [a, b] = lockKeys.slot(s.zoneId, s.row, s.col);
    await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock($1::int, $2::int)', a, b);
  }
}
