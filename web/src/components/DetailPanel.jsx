import { useEffect, useRef, useState } from 'react';
import { TYPE_LABELS, ISO_DESCRIPTIONS } from '../data/config';
import { posLabel } from '../data/generateData';
import { api } from '../api/client';
import { toUiType } from '../api/typeMap';
import { describeMovement, dwellDays, formatDateTime } from '../data/history';

function Field({ label, children, mono }) {
  return (
    <div className="detail-field">
      <label>{label}</label>
      <div className={`val${mono ? ' mono' : ''}`}>{children}</div>
    </div>
  );
}

function Visit({ visit, current }) {
  const type = toUiType(visit.type);
  return (
    <div className={`history-visit${current ? ' current' : ''}`}>
      <div className="history-visit-header">
        <span>{current && visit.status === 'PRESENT' ? 'Séjour en cours' : 'Séjour'}</span>
        <span className="mono">
          {formatDateTime(visit.entryDate)} → {visit.exitDate ? formatDateTime(visit.exitDate) : 'aujourd’hui'}
          {' · '}{dwellDays(visit.entryDate, visit.exitDate)} j
        </span>
      </div>
      {!current && (
        <div className="history-visit-meta">
          {TYPE_LABELS[type] ?? visit.type} · {visit.client ?? 'Client inconnu'}
          {visit.weightKg != null ? ` · ${visit.weightKg} kg` : ''}
        </div>
      )}
      <ol className="history-timeline">
        {visit.movements.map((m) => {
          const d = describeMovement(m);
          return (
            <li key={m.id} className={`history-item${d.undone ? ' undone' : ''}`}>
              <span className="history-icon">{d.icon}</span>
              <div className="history-body">
                <div className="history-title">
                  <strong>{d.label}</strong>
                  <span className="history-when mono">{d.when}</span>
                </div>
                {d.detail && <div className="history-detail mono">{d.detail}</div>}
                <div className="history-author">par {d.author}</div>
                {d.undone && <div className="history-undone">Annulé le {d.undone.when} par {d.undone.by}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Offcanvas with everything known about a container: current details, its
// stack, reefer data and the full history of all its visits.
export default function DetailPanel({ container, stacks, historyStamp, onClose, onOpenDetail }) {
  const open = !!container;
  // Keep the last container rendered while the panel slides out.
  const lastRef = useRef(null);
  if (container) lastRef.current = container;
  const ct = container ?? lastRef.current;

  const id = container?._dbId;
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    api
      .getContainerHistory(id)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id, historyStamp]);

  const loaded = history && ct && history.visits.some((v) => v.containerId === ct._dbId) ? history : null;
  const currentVisit = loaded?.visits.find((v) => v.containerId === ct._dbId);
  const departed = ct?.departed || currentVisit?.status === 'DEPARTED';
  const stack = ct && !departed ? stacks[ct.zone]?.[ct.row]?.[ct.col] || [] : [];
  const r = ct?.reefer;

  return (
    <>
      <div className={`offcanvas-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`detail-panel${open ? ' open' : ''}`} aria-hidden={!open}>
        {ct && (
          <>
            <div className="detail-header">
              <div>
                <h2 style={{ color: `var(--${ct.type})` }}>{ct.id}</h2>
                <div className="detail-subtitle">Transporteur {ct.id.substring(0, 4)}</div>
              </div>
              <button className="detail-close" onClick={onClose} aria-label="Fermer">✕</button>
            </div>
            <div className="detail-body">
              <div className="detail-status-bar">
                <span className="detail-status-chip" style={{ background: `var(--${ct.type}-bg)`, color: `var(--${ct.type})` }}>
                  {TYPE_LABELS[ct.type]}
                </span>
                <span className="detail-status-chip" style={departed
                  ? { background: 'var(--surface-3)', color: 'var(--text-dim)' }
                  : { background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>
                  {departed ? 'Parti' : 'Présent'}
                </span>
                <span className="detail-status-chip" style={ct.customsStatus === 'HOLD'
                  ? { background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }
                  : { background: 'var(--surface-3)', color: 'var(--text-dim)' }}>
                  {ct.customsStatus === 'HOLD' ? 'Bloqué douane' : 'Libre douane'}
                </span>
              </div>

              <div className="detail-section-title">Informations</div>
              <div className="detail-grid">
                <Field label="Code ISO 6346" mono>
                  {ct.isoCode || '—'}{ISO_DESCRIPTIONS[ct.isoCode] ? ` — ${ISO_DESCRIPTIONS[ct.isoCode]}` : ''}
                </Field>
                <Field label="Client">{ct.client}</Field>
                <Field label="Poids" mono>{ct.weight}</Field>
                <Field label="Entrée" mono>{currentVisit ? formatDateTime(currentVisit.entryDate) : ct.entryDate}</Field>
                <Field label="Sortie prévue" mono>{ct.exitDate || '—'}</Field>
                <Field label="Durée de séjour" mono>
                  {currentVisit ? `${dwellDays(currentVisit.entryDate, currentVisit.exitDate)} jour(s)` : '—'}
                </Field>
                <Field label="Révision" mono>n° {ct.version ?? '—'}</Field>
                <Field label="Visites au dépôt" mono>{loaded ? loaded.visits.length : '—'}</Field>
              </div>

              {!departed && (
                <>
                  <div className="detail-section-title">Position</div>
                  <Field label="Emplacement" mono>
                    {ct.zone} — Bay {String(ct.col + 1).padStart(2, '0')} — Row {String(ct.row + 1).padStart(2, '0')} — Tier {ct.tier}
                  </Field>
                  <Field label="Accessible directement">
                    <span style={{ color: ct.tier === stack.length ? 'var(--empty-20)' : 'var(--full-20)' }}>
                      {ct.tier === stack.length ? '✓ Oui (sommet de pile)' : '✗ Non (conteneur au-dessus)'}
                    </span>
                  </Field>
                  <div className="detail-field">
                    <label>Pile {posLabel(ct.zone, ct.row, ct.col)} ({stack.length}/3)</label>
                    <div className="detail-stack">
                      {[...stack].reverse().map((s) => (
                        <button
                          key={s._dbId}
                          className={`detail-stack-item${s._dbId === ct._dbId ? ' active' : ''}`}
                          onClick={() => onOpenDetail(s)}
                          disabled={s._dbId === ct._dbId}
                        >
                          <span className="mono">T{s.tier}</span>
                          <span className="mono" style={{ color: `var(--${s.type})` }}>{s.id}</span>
                          <span>{TYPE_LABELS[s.type]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {r && (
                <>
                  <div className="detail-section-divider">Reefer Monitoring</div>
                  <Field label="Marchandise">{r.commodity}</Field>
                  <Field label="Température" mono>
                    <span style={{ color: r.tempAlert ? 'var(--danger)' : 'var(--success)' }}>{r.currentTemp}°C</span>
                    {' '}(consigne : {r.setPoint}°C · plage : {r.tempMin} ~ {r.tempMax}°C)
                    {r.tempAlert && <div className="history-undone">ALERTE : température hors plage ou hors tension</div>}
                  </Field>
                  <Field label="Alimentation">
                    <span style={{ color: r.powerStatus === 'on' ? 'var(--success)' : 'var(--danger)' }}>
                      {r.powerStatus === 'on' ? 'Sous tension' : 'HORS TENSION'}
                    </span>
                  </Field>
                  <Field label="Ventilation / Humidité" mono>{r.ventSetting} / {r.humidity}</Field>
                  <Field label="Dernier relevé" mono>{formatDateTime(r.lastTempUpdate)}</Field>
                </>
              )}

              <div className="detail-section-title">Historique</div>
              {error && <div className="form-result error">Historique indisponible : {error}</div>}
              {!loaded && !error && <div className="history-loading">Chargement de l’historique…</div>}
              {loaded && loaded.visits.map((v) => (
                <Visit key={v.containerId} visit={v} current={v.containerId === ct._dbId} />
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
