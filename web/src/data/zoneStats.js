import { MAX_TIER } from './config';

export function zoneStats(zones, stacks, containers, zoneFilter) {
  const selectedZones = zoneFilter === 'all' ? zones : zones.filter(z => z.id === zoneFilter);
  const zoneIds = new Set(selectedZones.map(z => z.id));
  const selectedContainers = containers.filter(ct => zoneIds.has(ct.zone));
  const capacity = selectedZones.reduce((sum, z) => sum + (z.rows * z.cols - (z.blockedSlots?.length || 0)) * (z.maxTier ?? MAX_TIER), 0);
  let multiStacks = 0;
  for (const z of selectedZones) {
    for (let r = 0; r < z.rows; r++) {
      for (let c = 0; c < z.cols; c++) {
        if ((stacks[z.id]?.[r]?.[c]?.length ?? 0) >= 2) multiStacks++;
      }
    }
  }
  return {
    totalContainers: selectedContainers.length,
    occupancy: capacity ? Math.round(selectedContainers.length / capacity * 100) : 0,
    reeferCount: selectedContainers.filter(ct => ct.type.includes('reefer')).length,
    multiStacks,
  };
}
