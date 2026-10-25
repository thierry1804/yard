// What to show when a movement-history entry is clicked: the container for the
// detail panel (live if still in the yard, a departed snapshot otherwise), the
// slot to highlight on the plan, and the zone tab to display.
export function resolveFocus(entry, allContainers, zoneFilter) {
  const live = allContainers.find((c) => c._dbId === entry.ct._dbId);
  if (!live) {
    return {
      container: { id: entry.ct.id, _dbId: entry.ct._dbId, type: entry.ct.type, departed: true },
      highlight: null,
      zoneFilter,
    };
  }
  return {
    container: live,
    highlight: { zone: live.zone, row: live.row, col: live.col },
    zoneFilter: zoneFilter === 'all' || zoneFilter === live.zone ? zoneFilter : live.zone,
  };
}
