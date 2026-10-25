import { TYPE_LABELS, ISO_DESCRIPTIONS } from '../data/config';

export default function DetailPanel({ container, stacks, onClose }) {
  if (!container) return null;

  const ct = container;
  const stack = stacks[ct.zone]?.[ct.row]?.[ct.col] || [];
  const r = ct.reefer;

  return (
    <div className="detail-panel open">
      <div className="detail-header">
        <h2 style={{ color: `var(--${ct.type})` }}>{ct.id}</h2>
        <button className="detail-close" onClick={onClose}>✕</button>
      </div>
      <div className="detail-body">
        <div className="detail-status-bar">
          <span className="detail-status-chip" style={{ background: `var(--${ct.type}-bg)`, color: `var(--${ct.type})` }}>
            {TYPE_LABELS[ct.type]}
          </span>
          <span className="detail-status-chip" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            Tier {ct.tier}/{stack.length}
          </span>
          {ct.isoCode && (
            <span className="detail-status-chip" style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}>
              ISO {ct.isoCode}
            </span>
          )}
        </div>
        <div className="detail-field">
          <label>Code ISO 6346</label>
          <div className="val mono">{ct.isoCode || '—'} {ISO_DESCRIPTIONS[ct.isoCode] ? `— ${ISO_DESCRIPTIONS[ct.isoCode]}` : ''}</div>
        </div>
        <div className="detail-field">
          <label>Position complète</label>
          <div className="val mono">{ct.zone} — Bay {String(ct.col + 1).padStart(2, '0')} — Row {String(ct.row + 1).padStart(2, '0')} — Tier {ct.tier}</div>
        </div>
        <div className="detail-field">
          <label>Hauteur de pile</label>
          <div className="val mono">{stack.length} / 3 niveaux</div>
        </div>
        <div className="detail-field">
          <label>Client</label>
          <div className="val">{ct.client}</div>
        </div>
        <div className="detail-field">
          <label>Poids</label>
          <div className="val mono">{ct.weight}</div>
        </div>
        <div className="detail-field">
          <label>Date d'entrée</label>
          <div className="val mono">{ct.entryDate}</div>
        </div>
        <div className="detail-field">
          <label>Sortie prévue</label>
          <div className="val mono">{ct.exitDate}</div>
        </div>
        <div className="detail-field">
          <label>Transporteur</label>
          <div className="val mono">{ct.id.substring(0, 4)}</div>
        </div>
        <div className="detail-field">
          <label>Accessible directement</label>
          <div className="val" style={{ color: ct.tier === stack.length ? 'var(--empty-20)' : 'var(--full-20)' }}>
            {ct.tier === stack.length ? '✓ Oui (sommet de pile)' : '✗ Non (conteneur en dessous)'}
          </div>
        </div>

        {/* Reefer section */}
        {r && (
          <>
            <div className="detail-section-divider">Reefer Monitoring</div>
            <div className="detail-field">
              <label>Marchandise</label>
              <div className="val">{r.commodity}</div>
            </div>
            <div className="detail-field">
              <label>Température</label>
              <div className="val mono">
                <span style={{ color: r.tempAlert ? 'var(--danger)' : 'var(--success)' }}>
                  {r.currentTemp}°C
                </span>
                {' '} (consigne: {r.setPoint}°C · plage: {r.tempMin} ~ {r.tempMax}°C)
              </div>
              {r.tempAlert && (
                <div style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 700, marginTop: 4 }}>
                  ALERTE : Température hors plage !
                </div>
              )}
            </div>
            <div className="detail-field">
              <label>Alimentation</label>
              <div className="val" style={{ color: r.powerStatus === 'on' ? 'var(--success)' : 'var(--danger)' }}>
                {r.powerStatus === 'on' ? 'Sous tension' : 'HORS TENSION'}
              </div>
            </div>
            <div className="detail-field">
              <label>Ventilation / Humidité</label>
              <div className="val mono">{r.ventSetting} / {r.humidity}</div>
            </div>
            <div className="detail-field">
              <label>Dernière MAJ température</label>
              <div className="val mono">{new Date(r.lastTempUpdate).toLocaleString('fr-FR')}</div>
            </div>
          </>
        )}

        <div className="detail-field">
          <label>Source</label>
          <div className="val" style={{ color: 'var(--accent)' }}>CargoWise → Sync auto</div>
        </div>
      </div>
    </div>
  );
}
