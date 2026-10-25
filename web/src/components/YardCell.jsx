import { useRef, useCallback, useEffect } from 'react';
import { MAX_TIER } from '../data/config';
import { canStack } from '../data/rules';

export default function YardCell({ stack, zone, row, col, activeFilter, searchQuery, onDragStart, dragData, onShowTooltip, onHideTooltip, onContextMenu, justMoved, focused, blocked = false, maxTier = MAX_TIER }) {
  const cellRef = useRef(null);

  useEffect(() => {
    if (focused) cellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [focused]);

  const isEmpty = stack.length === 0;
  const topCt = !isEmpty ? stack[stack.length - 1] : null;

  // Determine classes
  let className = 'yard-cell';
  if (isEmpty) {
    className += blocked ? ' empty-slot blocked-slot' : ' empty-slot';
  } else {
    className += ' has-stack type-' + topCt.type;
  }

  // Filter
  if (!isEmpty && activeFilter !== 'all') {
    if (!stack.some(ct => ct.type === activeFilter)) {
      className += ' filtered-out';
    }
  }

  // Search highlight
  const q = searchQuery.toUpperCase().trim();
  if (!isEmpty && q.length >= 3 && stack.some(ct => ct.id.includes(q))) {
    className += ' highlight';
  }

  // Drag states
  const isSource = dragData && dragData.fromZone === zone && dragData.fromRow === row && dragData.fromCol === col;
  if (isSource) className += ' dragging';

  const isDragActive = dragData && !isSource;
  if (isDragActive) {
    if (!blocked && stack.length < maxTier && canStack(dragData.ct.type, stack)) {
      className += ' drop-valid';
    } else {
      className += ' drop-invalid';
    }
  }

  if (justMoved) className += ' just-moved';
  if (focused) className += ' focused';

  const pendingDrag = useRef(null);
  const movedPointer = useRef(false);
  useEffect(() => () => pendingDrag.current?.(), []);
  const handleMouseDown = useCallback((e) => {
    if (isEmpty || e.button !== 0) return;
    movedPointer.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const cleanup = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', cleanup);
      pendingDrag.current = null;
    };
    const move = (event) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8) return;
      movedPointer.current = true;
      cleanup();
      onHideTooltip();
      onDragStart(event, zone, row, col);
    };
    pendingDrag.current?.();
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', cleanup);
    pendingDrag.current = cleanup;
  }, [isEmpty, onDragStart, onHideTooltip, zone, row, col]);

  const handleMouseEnter = useCallback((e) => {
    if (dragData) {
      // handled by parent for drop-hover
    } else if (!isEmpty) {
      onShowTooltip(e, zone, row, col);
    }
  }, [dragData, isEmpty, onShowTooltip, zone, row, col]);

  const handleMouseLeave = useCallback(() => {
    if (!dragData) onHideTooltip();
  }, [dragData, onHideTooltip]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (!isEmpty && !dragData) {
      onContextMenu(zone, row, col);
    }
  }, [isEmpty, dragData, onContextMenu, zone, row, col]);

  const handleDoubleClick = useCallback(() => {
    if (!isEmpty && !dragData) {
      onContextMenu(zone, row, col);
    }
  }, [isEmpty, dragData, onContextMenu, zone, row, col]);

  return (
    <div
      ref={cellRef}
      className={className}
      role={isEmpty ? undefined : 'button'}
      tabIndex={isEmpty ? undefined : 0}
      aria-label={`${zone}, rangée ${row + 1}, baie ${col + 1} : ${isEmpty ? (blocked ? 'condamné' : 'libre') : `${stack.length} conteneur(s), sommet ${topCt.id}`}`}
      onKeyDown={(e) => { if (!isEmpty && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onContextMenu(zone, row, col); } }}
      data-zone={zone}
      data-row={row}
      data-col={col}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={() => { if (!movedPointer.current) handleDoubleClick(); }}
    >
      {isEmpty && blocked && <span aria-hidden="true">×</span>}
      {!isEmpty && (
        <>
          <div className="cell-top-line">
            <span>{topCt.type.includes('20') ? "20'" : "40'"}</span>
            {topCt.type.includes('reefer') && <span className="cell-reefer-icon">❄</span>}
          </div>
          <div className="cell-id">{topCt.id}</div>
          <div className="tier-indicator">
            {Array.from({ length: maxTier }, (_, t) => {
              const filled = t < stack.length;
              const color = filled
                ? (stack[t].type.includes('reefer') ? 'var(--reefer)' : stack[t].type.includes('full') ? 'var(--full-20)' : 'var(--empty-20)')
                : 'var(--border)';
              return <div key={t} className={`tier-block${filled ? ' filled' : ''}`} style={{ background: color }}></div>;
            })}
          </div>
          {stack.length > 1 && <div className="stack-badge">{stack.length}</div>}
        </>
      )}
    </div>
  );
}
