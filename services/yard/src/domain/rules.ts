import type { ContainerType } from '@ccis/contracts';

export const MAX_TIER = 3;
export const CONTAINER_NO_RE = /^[A-Z]{4}\d{7}$/;
export const ZONE_ID_RE = /^[A-Z0-9]{1,4}$/;

export const ISO_CODES: Record<ContainerType, string> = {
  EMPTY_20: '22G0',
  EMPTY_40: '42G0',
  FULL_20: '22G1',
  FULL_40: '42G1',
  REEFER: '22R0',
  REEFER_FULL: '42R1',
};

// Mirrors the frontend rule (web/src/data/rules.js getSize).
export function sizeOf(type: string): 20 | 40 {
  return type.includes('20') ? 20 : 40;
}

export function isReefer(type: string): boolean {
  return type.startsWith('REEFER');
}

export function posLabel(zoneId: string, row: number, col: number): string {
  return `${zoneId}-Bay${String(col + 1).padStart(2, '0')}-R${String(row + 1).padStart(2, '0')}`;
}

export function normalizeContainerNo(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function placementError(stack: { type: string }[], type: string): string | null {
  if (stack.length >= MAX_TIER) return `Pile pleine (${MAX_TIER} niveaux max)`;
  if (sizeOf(type) === 40 && stack.some((c) => sizeOf(c.type) === 20)) {
    return "Interdit : un 40' ne peut pas être posé sur un 20'";
  }
  return null;
}

export function zoneDimsError(rows: number, cols: number): string | null {
  const ok = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && rows <= 30 && cols >= 1 && cols <= 40;
  return ok ? null : 'Dimensions invalides (rangées 1–30, baies 1–40).';
}

export interface Slot {
  row: number;
  col: number;
  tier: number;
}

// Same strategy as the prototype: 40' first then 20', each group starting on a
// fresh slot (a 40' never lands on a 20'); within a group the latest exit date
// goes to the bottom so the earliest departures stay on top.
export function planCompaction(
  zone: { rows: number; cols: number },
  cts: { id: string; type: string; plannedExitDate: Date | null }[],
): Map<string, Slot> | null {
  const exitKey = (c: { plannedExitDate: Date | null }) => c.plannedExitDate?.toISOString() ?? '';
  const byExitDesc = (a: { plannedExitDate: Date | null }, b: { plannedExitDate: Date | null }) =>
    exitKey(b).localeCompare(exitKey(a));
  const groups = [
    cts.filter((c) => sizeOf(c.type) === 40).sort(byExitDesc),
    cts.filter((c) => sizeOf(c.type) === 20).sort(byExitDesc),
  ];
  const plan = new Map<string, Slot>();
  const totalSlots = zone.rows * zone.cols;
  let slot = 0;
  for (const group of groups) {
    for (let i = 0; i < group.length; i += MAX_TIER) {
      if (slot >= totalSlots) return null;
      group.slice(i, i + MAX_TIER).forEach((ct, k) => {
        plan.set(ct.id, { row: Math.floor(slot / zone.cols), col: slot % zone.cols, tier: k + 1 });
      });
      slot++;
    }
  }
  return plan;
}
