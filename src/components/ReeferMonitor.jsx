import { useState, useMemo } from 'react';
import { posLabel } from '../data/generateData';

export default function ReeferMonitor({ allContainers, onClose }) {
  const [filter, setFilter] = useState('all'); // all | alert | off

  const reefers = useMemo(() => {
    return allContainers.filter(c => c.reefer != null);
  }, [allContainers]);

  const alerts = reefers.filter(c => c.reefer.tempAlert);
  const powerOff = reefers.filter(c => c.reefer.powerStatus === 'off');

  const displayed = useMemo(() => {
    if (filter === 'alert') return alerts;
    if (filter === 'off') return powerOff;
    return reefers;
  }, [filter, reefers, alerts, powerOff]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-dashboard" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Reefer Monitoring</h3>
            <span className="modal-subtitle">Surveillance température & alimentation</span>
          </div>
          <button className="stack-popup-close" onClick={onClose}>✕</button>
        </div>

        {/* KPI bar */}
        <div className="reefer-kpi-bar">
          <div className="reefer-kpi">
            <span className="reefer-kpi-val" style={{ color: '#8b5cf6' }}>{reefers.length}</span>
            <span className="reefer-kpi-lbl">Total reefers</span>
          </div>
          <div className="reefer-kpi">
            <span className="reefer-kpi-val" style={{ color: alerts.length > 0 ? '#ef4444' : '#22c55e' }}>{alerts.length}</span>
            <span className="reefer-kpi-lbl">Alertes temp.</span>
          </div>
          <div className="reefer-kpi">
            <span className="reefer-kpi-val" style={{ color: powerOff.length > 0 ? '#f59e0b' : '#22c55e' }}>{powerOff.length}</span>
            <span className="reefer-kpi-lbl">Hors tension</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mvt-tabs" style={{ paddingLeft: 28 }}>
          <button className={`mvt-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            <span className="mvt-tab-icon">*</span> Tous ({reefers.length})
          </button>
          <button className={`mvt-tab${filter === 'alert' ? ' active' : ''}`} onClick={() => setFilter('alert')}>
            <span className="mvt-tab-icon" style={{ color: '#ef4444' }}>!</span> Alertes ({alerts.length})
          </button>
          <button className={`mvt-tab${filter === 'off' ? ' active' : ''}`} onClick={() => setFilter('off')}>
            <span className="mvt-tab-icon" style={{ color: '#f59e0b' }}>~</span> Hors tension ({powerOff.length})
          </button>
        </div>

        <div className="modal-body">
          {displayed.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 13 }}>
              Aucun reefer dans cette catégorie
            </div>
          ) : (
            <div className="reefer-list">
              {displayed.map(c => {
                const r = c.reefer;
                const tempDelta = r.currentTemp - r.setPoint;
                const tempClass = r.tempAlert ? 'reefer-temp-alert' : 'reefer-temp-ok';
                return (
                  <div key={c.id} className={`reefer-card${r.tempAlert ? ' reefer-card-alert' : ''}`}>
                    <div className="reefer-card-header">
                      <div>
                        <span className="reefer-card-id">{c.id}</span>
                        <span className="reefer-card-iso">{c.isoCode}</span>
                      </div>
                      <div className="reefer-card-pos">{posLabel(c.zone, c.row, c.col)}</div>
                    </div>
                    <div className="reefer-card-commodity">{r.commodity}</div>
                    <div className="reefer-card-temps">
                      <div className="reefer-temp-block">
                        <span className="reefer-temp-label">Consigne</span>
                        <span className="reefer-temp-value">{r.setPoint}°C</span>
                      </div>
                      <div className="reefer-temp-block">
                        <span className="reefer-temp-label">Actuelle</span>
                        <span className={`reefer-temp-value ${tempClass}`}>
                          {r.currentTemp}°C
                          <span className="reefer-temp-delta">
                            ({tempDelta >= 0 ? '+' : ''}{tempDelta.toFixed(1)})
                          </span>
                        </span>
                      </div>
                      <div className="reefer-temp-block">
                        <span className="reefer-temp-label">Plage</span>
                        <span className="reefer-temp-value">{r.tempMin} ~ {r.tempMax}°C</span>
                      </div>
                    </div>
                    <div className="reefer-card-footer">
                      <div className={`reefer-power-badge ${r.powerStatus === 'on' ? 'power-on' : 'power-off'}`}>
                        {r.powerStatus === 'on' ? 'Sous tension' : 'HORS TENSION'}
                      </div>
                      <div className="reefer-meta">
                        <span>Vent: {r.ventSetting}</span>
                        <span>Hum: {r.humidity}</span>
                      </div>
                      <div className="reefer-last-update">
                        MAJ: {new Date(r.lastTempUpdate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
