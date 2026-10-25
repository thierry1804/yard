import { describe, expect, it } from 'vitest';
import {
  MAX_TIER, normalizeContainerNo, placementError, planCompaction, posLabel, sizeOf, zoneDimsError,
} from '../src/domain/rules';
import { computeTempAlert, defaultReefer } from '../src/domain/reefer';

describe('sizeOf', () => {
  it('only types containing 20 are 20 feet (REEFER counts as 40)', () => {
    expect(sizeOf('EMPTY_20')).toBe(20);
    expect(sizeOf('FULL_40')).toBe(40);
    expect(sizeOf('REEFER')).toBe(40);
    expect(sizeOf('REEFER_FULL')).toBe(40);
  });
});

describe('placementError', () => {
  it('accepts an empty stack', () => {
    expect(placementError([], 'FULL_40')).toBeNull();
  });
  it('refuses a full stack', () => {
    const full = Array.from({ length: MAX_TIER }, () => ({ type: 'FULL_20' }));
    expect(placementError(full, 'FULL_20')).toMatch(/Pile pleine/);
  });
  it("refuses a 40' on a 20'", () => {
    expect(placementError([{ type: 'EMPTY_20' }], 'FULL_40')).toMatch(/40' .* 20'/);
  });
  it("accepts a 20' on a 40'", () => {
    expect(placementError([{ type: 'FULL_40' }], 'EMPTY_20')).toBeNull();
  });
});

describe('zoneDimsError', () => {
  it('bounds rows 1-30 and cols 1-40', () => {
    expect(zoneDimsError(1, 1)).toBeNull();
    expect(zoneDimsError(30, 40)).toBeNull();
    expect(zoneDimsError(0, 5)).not.toBeNull();
    expect(zoneDimsError(5, 41)).not.toBeNull();
    expect(zoneDimsError(2.5, 5)).not.toBeNull();
  });
});

describe('normalizeContainerNo', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeContainerNo(' mscu 123 4567 ')).toBe('MSCU1234567');
  });
});

describe('posLabel', () => {
  it('formats zone, bay and row 1-based', () => {
    expect(posLabel('A', 0, 9)).toBe('A-Bay10-R01');
  });
});

describe('planCompaction', () => {
  const d = (s: string) => new Date(s);
  it("puts 40' first, latest exit at the bottom, fills 3 high", () => {
    const plan = planCompaction({ rows: 2, cols: 2 }, [
      { id: 'a20', type: 'FULL_20', plannedExitDate: d('2026-11-01') },
      { id: 'b40', type: 'FULL_40', plannedExitDate: d('2026-11-05') },
      { id: 'c40', type: 'EMPTY_40', plannedExitDate: d('2026-11-10') },
      { id: 'd20', type: 'EMPTY_20', plannedExitDate: d('2026-11-20') },
    ])!;
    expect(plan.get('c40')).toEqual({ row: 0, col: 0, tier: 1 });
    expect(plan.get('b40')).toEqual({ row: 0, col: 0, tier: 2 });
    expect(plan.get('d20')).toEqual({ row: 0, col: 1, tier: 1 });
    expect(plan.get('a20')).toEqual({ row: 0, col: 1, tier: 2 });
  });
  it('returns null when containers do not fit', () => {
    const cts = Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, type: 'FULL_20', plannedExitDate: null }));
    expect(planCompaction({ rows: 1, cols: 1 }, cts)).toBeNull();
  });
});

describe('reefer', () => {
  it('defaultReefer stays within its commodity range', () => {
    const r = defaultReefer(new Date('2026-10-25T00:00:00Z'), () => 0.5);
    expect(r.currentTemp).toBeGreaterThanOrEqual(r.tempMin);
    expect(r.currentTemp).toBeLessThanOrEqual(r.tempMax);
    expect(r.alert).toBe(false);
  });
  it('computeTempAlert: power off or out of range', () => {
    const base = { powerStatus: 'on', currentTemp: 5, tempMin: 2, tempMax: 8 };
    expect(computeTempAlert(base)).toBe(false);
    expect(computeTempAlert({ ...base, currentTemp: 9 })).toBe(true);
    expect(computeTempAlert({ ...base, powerStatus: 'off' })).toBe(true);
  });
});
