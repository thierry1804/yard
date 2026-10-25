import { posLabel } from './generateData';

const LABELS = {
  ARRIVAL: { label: 'Arrivée (gate-in)', icon: '↓' },
  DEPARTURE: { label: 'Départ (gate-out)', icon: '↑' },
  MOVE: { label: 'Déplacement', icon: '↔' },
  TRANSFER: { label: 'Transfert de zone', icon: '⇄' },
  CORRECTION: { label: 'Correction d’inventaire', icon: '✓' },
  COMPACT: { label: 'Compactage', icon: '⧉' },
};

const DAY = 86_400_000;

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function place(p) {
  return p ? `${posLabel(p.zoneId, p.row, p.col)} · niveau ${p.tier}` : '';
}

// One timeline row of a container history movement (API shape from
// GET /containers/:id/history).
export function describeMovement(m) {
  const meta = LABELS[m.type] ?? { label: m.type, icon: '•' };
  const from = place(m.from);
  const to = place(m.to);
  const detail = from && to ? `${from} → ${to}` : from ? `${from} →` : to ? `→ ${to}` : '';
  return {
    icon: meta.icon,
    label: meta.label,
    detail,
    author: m.userEmail || '—',
    when: formatDateTime(m.createdAt),
    undone: m.undoneAt ? { when: formatDateTime(m.undoneAt), by: m.undoneByEmail || '—' } : null,
  };
}

// Started days spent in the yard (a container that arrived an hour ago has
// been there 1 day).
export function dwellDays(entryIso, exitIso, now = new Date()) {
  const end = exitIso ? new Date(exitIso) : now;
  return Math.max(1, Math.ceil((end - new Date(entryIso)) / DAY));
}
