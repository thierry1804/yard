import { useState } from 'react';

export default function ZoneManager({ zones, stacks, onClose, addZone, editZone, deleteZone }) {
  const [mode, setMode] = useState('list'); // list | add | edit
  const [editingZone, setEditingZone] = useState(null);
  const [form, setForm] = useState({ id: '', label: '', rows: 4, cols: 8 });

  const resetForm = () => setForm({ id: '', label: '', rows: 4, cols: 8 });

  const handleAdd = async () => {
    const id = form.id.trim().toUpperCase();
    if (!id) return;
    const ok = await addZone(id, form.label || `Zone ${id}`, parseInt(form.rows), parseInt(form.cols));
    if (ok) { resetForm(); setMode('list'); }
  };

  const startEdit = (zone) => {
    setEditingZone(zone);
    setForm({ id: zone.id, label: zone.label, rows: zone.rows, cols: zone.cols });
    setMode('edit');
  };

  const handleEdit = async () => {
    const ok = await editZone(editingZone.id, form.label, parseInt(form.rows), parseInt(form.cols));
    if (ok) { resetForm(); setEditingZone(null); setMode('list'); }
  };

  const handleDelete = (zone) => {
    if (window.confirm(`Supprimer la zone ${zone.id} (${zone.label}) ?`)) {
      deleteZone(zone.id);
    }
  };

  const getContainerCount = (zoneId, zone) => {
    let count = 0;
    if (!stacks[zoneId]) return 0;
    for (let r = 0; r < zone.rows; r++)
      for (let c = 0; c < zone.cols; c++)
        if (stacks[zoneId][r] && stacks[zoneId][r][c]) count += stacks[zoneId][r][c].length;
    return count;
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Gestion des zones</h3>
            <span className="modal-subtitle">{zones.length} zone(s) configurée(s)</span>
          </div>
          <button className="stack-popup-close" onClick={onClose}>✕</button>
        </div>

        {mode === 'list' && (
          <div className="modal-body">
            <div className="zone-list">
              {zones.map(zone => {
                const count = getContainerCount(zone.id, zone);
                const capacity = (zone.rows * zone.cols - (zone.blockedSlots?.length || 0)) * (zone.maxTier ?? 3);
                const pct = capacity ? Math.round(count / capacity * 100) : 0;
                return (
                  <div key={zone.id} className="zone-list-item">
                    <div className="zone-list-id">{zone.id}</div>
                    <div className="zone-list-info">
                      <div className="zone-list-label">{zone.label}</div>
                      <div className="zone-list-meta">
                        {zone.rows} rangées x {zone.cols} baies · {count}/{capacity} ({pct}%)
                      </div>
                      <div className="zone-list-bar">
                        <div className="zone-list-bar-fill" style={{ width: pct + '%', background: pct > 80 ? 'var(--danger)' : pct > 50 ? 'var(--full-20)' : 'var(--success)' }}></div>
                      </div>
                    </div>
                    <div className="zone-list-actions">
                      <button className="zone-action-btn" onClick={() => startEdit(zone)} title="Modifier">✎</button>
                      <button className="zone-action-btn zone-action-delete" onClick={() => handleDelete(zone)} title="Supprimer">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="modal-primary-btn" onClick={() => { resetForm(); setMode('add'); }}>
              + Ajouter une zone
            </button>
          </div>
        )}

        {(mode === 'add' || mode === 'edit') && (
          <div className="modal-body">
            <div className="modal-back" onClick={() => { setMode('list'); resetForm(); }}>
              ← Retour à la liste
            </div>
            <h4 className="modal-form-title">{mode === 'add' ? 'Nouvelle zone' : `Modifier zone ${editingZone.id}`}</h4>
            <div className="modal-form">
              {mode === 'add' && (
                <div className="form-field">
                  <label>Identifiant</label>
                  <input
                    type="text"
                    value={form.id}
                    onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                    placeholder="Ex: D, E, F..."
                    maxLength={3}
                    className="form-input form-input-short"
                  />
                </div>
              )}
              <div className="form-field">
                <label>Libellé</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Ex: Zone D — Stockage"
                  className="form-input"
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Rangées</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.rows}
                    onChange={e => setForm(f => ({ ...f, rows: e.target.value }))}
                    className="form-input form-input-short"
                  />
                </div>
                <div className="form-field">
                  <label>Baies (colonnes)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.cols}
                    onChange={e => setForm(f => ({ ...f, cols: e.target.value }))}
                    className="form-input form-input-short"
                  />
                </div>
              </div>
              <div className="form-preview">
                Capacité : {(parseInt(form.rows) || 0) * (parseInt(form.cols) || 0)} emplacements · {(parseInt(form.rows) || 0) * (parseInt(form.cols) || 0) * 3} conteneurs max
              </div>
              <button className="modal-primary-btn" onClick={mode === 'add' ? handleAdd : handleEdit}>
                {mode === 'add' ? 'Créer la zone' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
