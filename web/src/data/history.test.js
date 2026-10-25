import { describe, expect, it } from 'vitest';
import { describeMovement, dwellDays, formatDateTime } from './history';

const at = '2026-10-25T08:05:00.000Z';

describe('describeMovement', () => {
  it('arrival: no origin, destination position, author', () => {
    const d = describeMovement({ type: 'ARRIVAL', from: null, to: { zoneId: 'A', row: 0, col: 9, tier: 1 }, userEmail: 'op@ccis.mg', createdAt: at, undoneAt: null });
    expect(d).toMatchObject({ label: 'Arrivée (gate-in)', detail: '→ A-Bay10-R01 · niveau 1', author: 'op@ccis.mg', undone: null });
  });

  it('move: origin → destination', () => {
    const d = describeMovement({ type: 'MOVE', from: { zoneId: 'A', row: 0, col: 0, tier: 2 }, to: { zoneId: 'B', row: 1, col: 1, tier: 1 }, userEmail: null, createdAt: at, undoneAt: null });
    expect(d.label).toBe('Déplacement');
    expect(d.detail).toBe('A-Bay01-R01 · niveau 2 → B-Bay02-R02 · niveau 1');
    expect(d.author).toBe('—');
  });

  it('departure, transfer and compaction labels', () => {
    const base = { from: { zoneId: 'A', row: 0, col: 0, tier: 1 }, to: null, userEmail: 'x', createdAt: at, undoneAt: null };
    expect(describeMovement({ ...base, type: 'DEPARTURE' }).label).toBe('Départ (gate-out)');
    expect(describeMovement({ ...base, type: 'DEPARTURE' }).detail).toBe('A-Bay01-R01 · niveau 1 →');
    expect(describeMovement({ ...base, type: 'TRANSFER', to: base.from }).label).toBe('Transfert de zone');
    expect(describeMovement({ ...base, type: 'COMPACT', to: base.from }).label).toBe('Compactage');
  });

  it('undone movements carry who and when', () => {
    const d = describeMovement({ type: 'MOVE', from: null, to: null, userEmail: 'op', createdAt: at, undoneAt: at, undoneByEmail: 'admin@ccis.mg' });
    expect(d.undone).toEqual({ when: formatDateTime(at), by: 'admin@ccis.mg' });
  });
});

describe('dwellDays', () => {
  it('counts started days between entry and exit, or now', () => {
    expect(dwellDays('2026-10-20T10:00:00Z', '2026-10-25T09:00:00Z')).toBe(5);
    expect(dwellDays('2026-10-25T10:00:00Z', '2026-10-25T11:00:00Z')).toBe(1);
    expect(dwellDays('2026-10-20T10:00:00Z', null, new Date('2026-10-22T10:00:00Z'))).toBe(2);
  });
});

describe('formatDateTime', () => {
  it('formats in French with date and time, — when missing', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(at)).toMatch(/\d{2}\/\d{2}\/2026.*\d{2}:\d{2}/);
  });
});
