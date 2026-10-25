import { describe, expect, it } from 'vitest';
import { resolveFocus } from './focus';

const present = { id: 'MSCU1234567', _dbId: 'c1', type: 'full-20', zone: 'B', row: 1, col: 3, tier: 2 };
const entry = (ct) => ({ ct });

describe('resolveFocus', () => {
  it('present container: live object, highlight its slot, switch the zone tab when filtered elsewhere', () => {
    const f = resolveFocus(entry({ id: 'MSCU1234567', _dbId: 'c1', type: 'full-20' }), [present], 'A');
    expect(f.container).toBe(present);
    expect(f.highlight).toEqual({ zone: 'B', row: 1, col: 3 });
    expect(f.zoneFilter).toBe('B');
  });

  it('keeps "Tout" and a matching zone filter unchanged', () => {
    expect(resolveFocus(entry({ _dbId: 'c1' }), [present], 'all').zoneFilter).toBe('all');
    expect(resolveFocus(entry({ _dbId: 'c1' }), [present], 'B').zoneFilter).toBe('B');
  });

  it('departed container: departed snapshot for the panel, nothing to highlight, filter unchanged', () => {
    const f = resolveFocus(entry({ id: 'TCLU7654321', _dbId: 'gone', type: 'empty-40' }), [present], 'A');
    expect(f.container).toEqual({ id: 'TCLU7654321', _dbId: 'gone', type: 'empty-40', departed: true });
    expect(f.highlight).toBeNull();
    expect(f.zoneFilter).toBe('A');
  });
});
