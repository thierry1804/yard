import { MAX_TIER, TYPE_LABELS } from '../data/config';
import { posLabel } from '../data/generateData';

export default function StackPopup({ stackPopup, stacks, onClose, onOpenDetail }) {
  if (!stackPopup) return null;

  const { zone, row, col } = stackPopup;
  const stack = stacks[zone][row][col];
  if (!stack || stack.length === 0) return null;

  const pos = posLabel(zone, row, col);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="stack-popup-overlay open" onClick={handleOverlayClick}>
      <div className="stack-popup" onClick={e => e.stopPropagation()}>
        <div className="stack-popup-header">
          <div>
            <h3>Pile {pos}</h3>
            <span>{stack.length} conteneur{stack.length > 1 ? 's' : ''} · {MAX_TIER} niveaux max</span>
          </div>
          <button className="stack-popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="elevation-view">
          {Array.from({ length: MAX_TIER }, (_, i) => {
            const t = i + 1;
            const ct = stack.find(s => s.tier === t);
            if (ct) {
              return (
                <div
                  key={t}
                  className="elevation-container"
                  style={{ background: `var(--${ct.type}-bg)`, borderColor: `var(--${ct.type})` }}
                  onClick={() => onOpenDetail(ct)}
                >
                  <div className="ec-tier" style={{ color: `var(--${ct.type})` }}>T{t}</div>
                  <div className="ec-info">
                    <div className="ec-id" style={{ color: `var(--${ct.type})` }}>{ct.id}</div>
                    <div className="ec-meta">{ct.client} · {ct.weight}</div>
                  </div>
                  <div className="ec-badge" style={{ background: `var(--${ct.type}-bg)`, color: `var(--${ct.type})` }}>
                    {TYPE_LABELS[ct.type]}
                  </div>
                </div>
              );
            } else {
              return <div key={t} className="elevation-empty-tier">T{t} — Libre</div>;
            }
          })}
          <div className="elevation-ground"></div>
        </div>
      </div>
    </div>
  );
}
