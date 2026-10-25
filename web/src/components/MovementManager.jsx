import { useState } from 'react';
import { TYPES, TYPE_LABELS, CLIENTS, MAX_TIER } from '../data/config';
import { posLabel } from '../data/generateData';
import { canStack, getSize } from '../data/rules';

export default function MovementManager({
  zones, stacks, allContainers, onClose,
  containerArrival, containerDeparture, containerTransfer,
  movementLog
}) {
  const [tab, setTab] = useState('arrival');
  const tabs = [
    { id: 'arrival', label: 'Arrivée', icon: '↓' },
    { id: 'departure', label: 'Départ', icon: '↑' },
    { id: 'transfer', label: 'Transfert', icon: '⇄' },
    { id: 'log', label: 'Journal', icon: '☰' },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Mouvements de conteneurs</h3>
            <span className="modal-subtitle">{allContainers.length} conteneurs dans le yard</span>
          </div>
          <button className="stack-popup-close" onClick={onClose}>✕</button>
        </div>

        <div className="mvt-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`mvt-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="mvt-tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'arrival' && (
            <ArrivalForm zones={zones} stacks={stacks} containerArrival={containerArrival} />
          )}
          {tab === 'departure' && (
            <DepartureForm allContainers={allContainers} stacks={stacks} containerDeparture={containerDeparture} />
          )}
          {tab === 'transfer' && (
            <TransferForm zones={zones} allContainers={allContainers} stacks={stacks} containerTransfer={containerTransfer} />
          )}
          {tab === 'log' && (
            <MovementLog movementLog={movementLog} />
          )}
        </div>
      </div>
    </div>
  );
}

function ArrivalForm({ zones, stacks, containerArrival }) {
  const [form, setForm] = useState({
    id: '', type: 'full-20', client: CLIENTS[0], weight: '', plannedExitDate: '',
    zoneId: zones[0]?.id || '', row: 0, col: 0, autoSlot: true,
  });
  const [result, setResult] = useState(null);

  const findFirstSlot = (zoneId, type) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !stacks[zoneId]) return null;
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        const s = stacks[zoneId][r][c];
        if (s.length < MAX_TIER && canStack(type, s)) return { row: r, col: c };
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    let row = parseInt(form.row);
    let col = parseInt(form.col);

    if (form.autoSlot) {
      const slot = findFirstSlot(form.zoneId, form.type);
      if (!slot) {
        setResult({ ok: false, msg: 'Aucun emplacement disponible dans cette zone.' });
        return;
      }
      row = slot.row;
      col = slot.col;
    }

    const ok = await containerArrival({
      id: form.id || undefined,
      type: form.type,
      client: form.client,
      weight: form.weight || undefined,
      zoneId: form.zoneId,
      row,
      col,
      plannedExitDate: form.plannedExitDate || undefined,
    });

    if (ok) {
      setResult({ ok: true, msg: `Conteneur enregistré avec succès.` });
      setForm(f => ({ ...f, id: '', weight: '', plannedExitDate: '' }));
    } else {
      setResult({ ok: false, msg: 'Echec du placement.' });
    }
  };

  return (
    <div className="modal-form">
      <div className="form-section-title">Enregistrer une arrivée</div>
      <div className="form-field">
        <label>ID Conteneur (vide = auto)</label>
        <input
          type="text"
          value={form.id}
          onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
          placeholder="Ex: MSCU1234567"
          className="form-input"
        />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Type</label>
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="form-input"
          >
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]} ({getSize(t)}')</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Client</label>
          <select
            value={form.client}
            onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
            className="form-input"
          >
            {CLIENTS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Poids</label>
          <input
            type="text"
            value={form.weight}
            onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
            placeholder="Ex: 18500 kg"
            className="form-input"
          />
        </div>
        <div className="form-field">
          <label>Zone de destination</label>
          <select
            value={form.zoneId}
            onChange={e => setForm(f => ({ ...f, zoneId: e.target.value }))}
            className="form-input"
          >
            {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Date de sortie prévue (optionnel)</label>
        <input
          type="date"
          value={form.plannedExitDate}
          onChange={e => setForm(f => ({ ...f, plannedExitDate: e.target.value }))}
          className="form-input"
        />
      </div>

      <label className="form-checkbox">
        <input
          type="checkbox"
          checked={form.autoSlot}
          onChange={e => setForm(f => ({ ...f, autoSlot: e.target.checked }))}
        />
        <span>Placement automatique (premier emplacement libre)</span>
      </label>

      {!form.autoSlot && (
        <div className="form-row">
          <div className="form-field">
            <label>Rangée (0-indexé)</label>
            <input
              type="number"
              min={0}
              value={form.row}
              onChange={e => setForm(f => ({ ...f, row: e.target.value }))}
              className="form-input form-input-short"
            />
          </div>
          <div className="form-field">
            <label>Baie (0-indexé)</label>
            <input
              type="number"
              min={0}
              value={form.col}
              onChange={e => setForm(f => ({ ...f, col: e.target.value }))}
              className="form-input form-input-short"
            />
          </div>
        </div>
      )}

      {result && (
        <div className={`form-result ${result.ok ? 'success' : 'error'}`}>{result.msg}</div>
      )}

      <button className="modal-primary-btn" onClick={handleSubmit}>
        Enregistrer l'arrivée
      </button>
    </div>
  );
}

function DepartureForm({ allContainers, stacks, containerDeparture }) {
  const [search, setSearch] = useState('');
  const [result, setResult] = useState(null);

  const q = search.toUpperCase().trim();
  const matches = q.length >= 3
    ? allContainers.filter(c => c.id.includes(q)).slice(0, 10)
    : [];

  const handleDepart = async (ct) => {
    if (window.confirm(`Demander une tâche de sortie pour ${ct.id} ?`)) {
      const ok = await containerDeparture(ct.id);
      if (ok) {
        setResult({ ok: true, msg: `Sortie demandée pour ${ct.id}. Confirmation dans Opérations → Tâches terrain.` });
        setSearch('');
      } else {
        setResult({ ok: false, msg: `Echec : le conteneur n'est probablement pas au sommet de sa pile.` });
      }
    }
  };

  return (
    <div className="modal-form">
      <div className="form-section-title">Demander une sortie (confirmation dans les tâches terrain)</div>
      <div className="form-field">
        <label>Rechercher le conteneur</label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ex: MSCU1234567 (min 3 car.)"
          className="form-input"
        />
      </div>

      {matches.length > 0 && (
        <div className="departure-list">
          {matches.map(ct => {
            const stack = stacks[ct.zone]?.[ct.row]?.[ct.col] || [];
            const isTop = stack[stack.length - 1] === ct;
            return (
              <div key={ct.id} className={`departure-item ${!isTop ? 'blocked' : ''}`}>
                <div className="departure-item-info">
                  <div className="departure-item-id" style={{ color: `var(--${ct.type})` }}>{ct.id}</div>
                  <div className="departure-item-meta">
                    {TYPE_LABELS[ct.type]} · {ct.client} · {posLabel(ct.zone, ct.row, ct.col)} T{ct.tier}
                  </div>
                  {!isTop && <div className="departure-item-warn">Pas au sommet — déplacez d'abord</div>}
                </div>
                <button
                  className={`departure-btn ${isTop ? '' : 'disabled'}`}
                  onClick={() => isTop && handleDepart(ct)}
                  disabled={!isTop}
                >
                  Sortie ↑
                </button>
              </div>
            );
          })}
        </div>
      )}

      {q.length >= 3 && matches.length === 0 && (
        <div className="form-result error">Aucun conteneur trouvé.</div>
      )}

      {result && (
        <div className={`form-result ${result.ok ? 'success' : 'error'}`}>{result.msg}</div>
      )}
    </div>
  );
}

function TransferForm({ zones, allContainers, stacks, containerTransfer }) {
  const [search, setSearch] = useState('');
  const [targetZone, setTargetZone] = useState(zones[0]?.id || '');
  const [result, setResult] = useState(null);

  const q = search.toUpperCase().trim();
  const matches = q.length >= 3
    ? allContainers.filter(c => c.id.includes(q)).slice(0, 10)
    : [];

  const handleTransfer = async (ct) => {
    if (ct.zone === targetZone) {
      setResult({ ok: false, msg: 'Le conteneur est déjà dans cette zone.' });
      return;
    }
    const ok = await containerTransfer(ct.id, targetZone);
    if (ok) {
      setResult({ ok: true, msg: `Transfert demandé pour ${ct.id} vers ${targetZone}. Confirmation dans Opérations → Tâches terrain.` });
      setSearch('');
    } else {
      setResult({ ok: false, msg: 'Echec du transfert.' });
    }
  };

  return (
    <div className="modal-form">
      <div className="form-section-title">Transférer vers une autre zone</div>
      <div className="form-row">
        <div className="form-field" style={{ flex: 2 }}>
          <label>Rechercher le conteneur</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ex: MSCU1234567"
            className="form-input"
          />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Zone cible</label>
          <select
            value={targetZone}
            onChange={e => setTargetZone(e.target.value)}
            className="form-input"
          >
            {zones.map(z => <option key={z.id} value={z.id}>{z.id} — {z.label}</option>)}
          </select>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="departure-list">
          {matches.map(ct => {
            const stack = stacks[ct.zone]?.[ct.row]?.[ct.col] || [];
            const isTop = stack[stack.length - 1] === ct;
            return (
              <div key={ct.id} className={`departure-item ${!isTop ? 'blocked' : ''}`}>
                <div className="departure-item-info">
                  <div className="departure-item-id" style={{ color: `var(--${ct.type})` }}>{ct.id}</div>
                  <div className="departure-item-meta">
                    {TYPE_LABELS[ct.type]} · Zone {ct.zone} · {posLabel(ct.zone, ct.row, ct.col)} T{ct.tier}
                  </div>
                  {!isTop && <div className="departure-item-warn">Pas au sommet — déplacez d'abord</div>}
                </div>
                <button
                  className={`departure-btn transfer-btn ${isTop ? '' : 'disabled'}`}
                  onClick={() => isTop && handleTransfer(ct)}
                  disabled={!isTop}
                >
                  ⇄ {targetZone}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {result && (
        <div className={`form-result ${result.ok ? 'success' : 'error'}`}>{result.msg}</div>
      )}
    </div>
  );
}

function MovementLog({ movementLog }) {
  const actionLabels = {
    arrival: { icon: '↓', label: 'Arrivée', color: 'var(--success)' },
    departure: { icon: '↑', label: 'Départ', color: 'var(--danger)' },
    transfer: { icon: '⇄', label: 'Transfert', color: 'var(--accent)' },
  };

  if (movementLog.length === 0) {
    return <div className="move-log-empty">Aucun mouvement enregistré dans cette session.</div>;
  }

  return (
    <div className="mvt-log-list">
      {movementLog.slice(0, 50).map((m, i) => {
        const a = actionLabels[m.action] || { icon: '?', label: m.action, color: 'var(--text-dim)' };
        const timeStr = m.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return (
          <div key={i} className="mvt-log-entry">
            <div className="mvt-log-icon" style={{ color: a.color }}>{a.icon}</div>
            <div className="mvt-log-body">
              <div className="mvt-log-action" style={{ color: a.color }}>{a.label}</div>
              <div className="mvt-log-id">{m.ct.id}</div>
              <div className="mvt-log-detail">
                {m.action === 'transfer' && m.fromPosition
                  ? `${m.fromPosition} → ${m.position}`
                  : m.position
                }
                {' · '}{TYPE_LABELS[m.ct.type]}
              </div>
            </div>
            <div className="mvt-log-time">{timeStr}</div>
          </div>
        );
      })}
    </div>
  );
}
