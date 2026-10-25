import { MAX_TIER } from './config';

export function getSize(type) {
  return type.includes('20') ? 20 : 40;
}

export function canStack(draggedType, targetStack) {
  if (targetStack.length === 0) return true;
  const draggedSize = getSize(draggedType);
  if (draggedSize === 40) {
    return !targetStack.some(ct => getSize(ct.type) === 20);
  }
  return true;
}

/**
 * Compact a zone: regroup containers to eliminate gaps.
 * Strategy:
 *  1. Extract all containers from the zone
 *  2. Separate 40' and 20' groups
 *  3. Within each group, sort by exit date (earliest exit = top of stack = placed last)
 *  4. Fill slots sequentially: 40' first (left side), then 20' (right side)
 *  5. Stack up to MAX_TIER per slot before moving to the next
 *
 * Returns the number of moves performed.
 */
export function compactZone(stacks, zone) {
  const rows = zone.rows;
  const cols = zone.cols;
  const zoneId = zone.id;

  // 1. Extract all containers
  const allCts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      allCts.push(...stacks[zoneId][r][c]);
      stacks[zoneId][r][c] = [];
    }
  }

  if (allCts.length === 0) return 0;

  // 2. Separate by size
  const cts40 = allCts.filter(ct => getSize(ct.type) === 40);
  const cts20 = allCts.filter(ct => getSize(ct.type) === 20);

  // 3. Sort each group: latest exit date first (they go to bottom),
  //    earliest exit date last (they end up on top = accessible)
  const byExitDesc = (a, b) => (b.exitDate || '').localeCompare(a.exitDate || '');
  cts40.sort(byExitDesc);
  cts20.sort(byExitDesc);

  // 4. Place containers into slots sequentially
  let slotIndex = 0;
  const totalSlots = rows * cols;

  const getSlotCoords = (idx) => ({
    r: Math.floor(idx / cols),
    c: idx % cols,
  });

  const placeGroup = (containers) => {
    let i = 0;
    while (i < containers.length && slotIndex < totalSlots) {
      const { r, c } = getSlotCoords(slotIndex);
      const stack = stacks[zoneId][r][c];

      // Fill this slot up to MAX_TIER
      while (stack.length < MAX_TIER && i < containers.length) {
        const ct = containers[i];
        ct.zone = zoneId;
        ct.row = r;
        ct.col = c;
        ct.tier = stack.length + 1;
        stack.push(ct);
        i++;
      }

      slotIndex++;
    }
  };

  // Place 40' first, then 20'
  placeGroup(cts40);
  placeGroup(cts20);

  return allCts.length;
}
