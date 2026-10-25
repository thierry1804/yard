import { useState, useEffect, useCallback, useRef } from 'react';
import { MAX_TIER, TYPE_LABELS } from '../data/config';
import { posLabel } from '../data/generateData';
import { canStack } from '../data/rules';
import YardCell from './YardCell';

export default function YardGrid({ stacks, zones, zoneFilter, activeFilter, searchQuery, executeMove, showToast, setStackPopup, onOpenDetail }) {
  const [dragData, setDragData] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [justMovedCell, setJustMovedCell] = useState(null);
  const ghostRef = useRef(null);
  const dragDataRef = useRef(null);

  const visibleZones = zoneFilter === 'all' ? zones : zones.filter(z => z.id === zoneFilter);

  const startDrag = useCallback((e, zoneId, row, col) => {
    const stack = stacks[zoneId][row][col];
    if (stack.length === 0) return;
    const topCt = stack[stack.length - 1];
    const dd = { ct: topCt, fromZone: zoneId, fromRow: row, fromCol: col };
    setDragData(dd);
    dragDataRef.current = dd;

    const ghost = ghostRef.current;
    if (ghost) {
      ghost.innerHTML = `<span>${topCt.id}</span><span style="font-size:9px;opacity:0.7">${TYPE_LABELS[topCt.type]}</span>`;
      ghost.style.background = `var(--${topCt.type}-bg)`;
      ghost.style.borderColor = `var(--${topCt.type})`;
      ghost.style.color = `var(--${topCt.type})`;
      ghost.style.left = (e.clientX + 14) + 'px';
      ghost.style.top = (e.clientY - 14) + 'px';
      ghost.classList.add('visible');
    }
  }, [stacks]);

  useEffect(() => {
    if (!dragData) return;

    const moveGhost = (e) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = (e.clientX + 14) + 'px';
        ghostRef.current.style.top = (e.clientY - 14) + 'px';
      }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('.yard-cell');
      if (cell) {
        const z = cell.dataset.zone;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const dd = dragDataRef.current;
        if (dd && !(z === dd.fromZone && r === dd.fromRow && c === dd.fromCol)) {
          const targetStack = stacks[z]?.[r]?.[c];
          if (targetStack && targetStack.length < MAX_TIER && canStack(dd.ct.type, targetStack)) {
            setHoverCell({ zone: z, row: r, col: c });
          } else {
            setHoverCell(null);
          }
        } else {
          setHoverCell(null);
        }
      } else {
        setHoverCell(null);
      }
    };

    const handleMouseUp = (e) => {
      const dd = dragDataRef.current;
      if (!dd) { cleanup(); return; }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('.yard-cell');
      if (cell) {
        const toZone = cell.dataset.zone;
        const toRow = parseInt(cell.dataset.row);
        const toCol = parseInt(cell.dataset.col);

        // Released on the cell it was grabbed from: a plain click opens the
        // container's details instead of moving it.
        if (toZone === dd.fromZone && toRow === dd.fromRow && toCol === dd.fromCol) {
          cleanup();
          onOpenDetail?.(dd.ct);
          return;
        }

        const targetStack = stacks[toZone]?.[toRow]?.[toCol];
        if (!targetStack) { cleanup(); return; }

        if (targetStack.length >= MAX_TIER) {
          showToast('error', `Pile pleine ! ${posLabel(toZone, toRow, toCol)} a déjà ${MAX_TIER} niveaux.`);
          cleanup();
          return;
        }

        if (!canStack(dd.ct.type, targetStack)) {
          showToast('error', `Interdit : un 40' ne peut pas être empilé sur un 20'.`);
          cleanup();
          return;
        }

        executeMove(dd.ct, dd.fromZone, dd.fromRow, dd.fromCol, toZone, toRow, toCol, true);
        setJustMovedCell({ zone: toZone, row: toRow, col: toCol });
        setTimeout(() => setJustMovedCell(null), 800);
      }
      cleanup();
    };

    const cleanup = () => {
      setDragData(null);
      setHoverCell(null);
      dragDataRef.current = null;
      if (ghostRef.current) ghostRef.current.classList.remove('visible');
    };

    document.addEventListener('mousemove', moveGhost);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', moveGhost);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragData, stacks, executeMove, showToast, onOpenDetail]);

  const showTooltip = useCallback((e, zoneId, row, col) => {
    const stack = stacks[zoneId]?.[row]?.[col];
    if (!stack || stack.length === 0) return;
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    let html = `<div class="tooltip-title">${posLabel(zoneId, row, col)} · ${stack.length} conteneur${stack.length > 1 ? 's' : ''}</div>`;
    for (let i = stack.length - 1; i >= 0; i--) {
      const ct = stack[i];
      html += `<div class="tooltip-stack-item">
        <span class="tooltip-tier-tag" style="color:var(--${ct.type})">T${ct.tier}</span>
        <span class="tooltip-ct-id">${ct.id}</span>
        <span class="tooltip-ct-type" style="color:var(--${ct.type})">${TYPE_LABELS[ct.type]}</span>
      </div>`;
    }
    html += '<div style="font-size:9px;color:var(--text-muted);margin-top:8px;text-align:center">Clic droit → vue pile · Glisser → déplacer le sommet</div>';
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');
    const rect = e.target.closest('.yard-cell').getBoundingClientRect();
    tooltip.style.left = (rect.right + 12) + 'px';
    tooltip.style.top = (rect.top - 10) + 'px';
  }, [stacks]);

  const hideTooltip = useCallback(() => {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) tooltip.classList.remove('visible');
  }, []);

  const openStackPopup = useCallback((zoneId, row, col) => {
    hideTooltip();
    setStackPopup({ zone: zoneId, row, col });
  }, [hideTooltip, setStackPopup]);

  return (
    <>
      <div className="yard-container">
        {visibleZones.map(zone => (
          <div key={zone.id} style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--text-dim)',
              marginBottom: 10, fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.5
            }}>
              {zone.label}
            </div>
            <div className="yard-grid-labels">
              {Array.from({ length: zone.cols }, (_, c) => (
                <div key={c} className="yard-col-label">Bay {String(c + 1).padStart(2, '0')}</div>
              ))}
            </div>
            {Array.from({ length: zone.rows }, (_, r) => (
              <div key={r} className="yard-row">
                <div className="yard-row-label">R{String(r + 1).padStart(2, '0')}</div>
                <div className="yard-cells">
                  {Array.from({ length: zone.cols }, (_, c) => {
                    const cellStack = stacks[zone.id]?.[r]?.[c] || [];
                    const isHovered = hoverCell && hoverCell.zone === zone.id && hoverCell.row === r && hoverCell.col === c;
                    const isJustMoved = justMovedCell && justMovedCell.zone === zone.id && justMovedCell.row === r && justMovedCell.col === c;
                    return (
                      <div
                        key={c}
                        className={isHovered ? 'yard-cell-wrapper drop-hover-wrapper' : ''}
                      >
                        <YardCell
                          stack={cellStack}
                          zone={zone.id}
                          row={r}
                          col={c}
                          activeFilter={activeFilter}
                          searchQuery={searchQuery}
                          onDragStart={startDrag}
                          dragData={dragData}
                          onShowTooltip={showTooltip}
                          onHideTooltip={hideTooltip}
                          onContextMenu={openStackPopup}
                          justMoved={isJustMoved}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="drag-ghost" ref={ghostRef} id="dragGhost"></div>
    </>
  );
}
