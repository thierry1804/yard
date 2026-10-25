import { describe, expect, it } from 'vitest';
import { MAX_TIER } from './config';
import { zoneStats } from './zoneStats';

const zones = [{ id: 'A', rows: 1, cols: 2 }, { id: 'R', rows: 1, cols: 1 }];
const containers = [{ zone: 'A', type: 'empty-20' }, { zone: 'A', type: 'full-20' }, { zone: 'R', type: 'reefer' }];
const stacks = { A: [[containers.slice(0, 2), []]], R: [[[containers[2]]]] };

describe('zoneStats', () => {
  it('uses only the selected zone and its capacity', () => {
    expect(zoneStats(zones, stacks, containers, 'R')).toEqual({ totalContainers: 1, occupancy: Math.round(100 / MAX_TIER), reeferCount: 1, multiStacks: 0 });
    expect(zoneStats(zones, stacks, containers, 'A')).toEqual({ totalContainers: 2, occupancy: Math.round(100 / MAX_TIER), reeferCount: 0, multiStacks: 1 });
  });
  it('aggregates every zone in the global view', () => {
    expect(zoneStats(zones, stacks, containers, 'all')).toEqual({ totalContainers: 3, occupancy: Math.round(100 / MAX_TIER), reeferCount: 1, multiStacks: 1 });
  });
  it('handles missing zones and empty capacity', () => {
    expect(zoneStats([], {}, [], 'all')).toEqual({ totalContainers: 0, occupancy: 0, reeferCount: 0, multiStacks: 0 });
    expect(zoneStats(zones, {}, containers, 'unknown').totalContainers).toBe(0);
  });
});

it('excludes condemned positions and uses the zone height limit', () => {
  expect(zoneStats([{id:'A',rows:1,cols:3,maxTier:2,blockedSlots:[{row:0,col:2}]}], stacks, containers, 'A').occupancy).toBe(50);
});
