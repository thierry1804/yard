import { TYPES, TYPE_LABELS } from '../data/config';
import { posLabel } from '../data/generateData';

const FILTER_COLORS = {
  all: '#64748b',
  'empty-20': 'var(--empty-20)',
  'empty-40': 'var(--empty-40)',
  'full-20': 'var(--full-20)',
  'full-40': 'var(--full-40)',
  'reefer': 'var(--reefer)',
  'reefer-full': 'var(--reefer-full)',
};

const FILTER_LABELS = {
  all: 'Tous',
  'empty-20': "Vide · 20'",
  'empty-40': "Vide · 40'",
  'full-20': "Plein · 20'",
  'full-40': "Plein · 40'",
  'reefer': 'Reefer · Vide',
  'reefer-full': 'Reefer · Plein',
};

export default function Sidebar({ stats, activeFilter, setActiveFilter, searchQuery, setSearchQuery, moveHistory, undoMove }) {
  const filters = ['all', ...TYPES];

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3>Recherche conteneur</h3>
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Ex: MSCU1234567"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Filtres</h3>
        <div className="filter-group">
          {filters.map(f => (
            <button
              key={f}
              className={`filter-btn${activeFilter === f ? ' active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              <span className="filter-dot" style={{ background: FILTER_COLORS[f] }}></span>
              {FILTER_LABELS[f]}
              <span className="filter-count">
                {f === 'all' ? stats.totalContainers : (stats.typeCounts[f] || 0)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Statistiques</h3>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value">{stats.totalContainers}</div><div className="stat-label">Conteneurs</div></div>
          <div className="stat-card"><div className="stat-value">{stats.occupancy}%</div><div className="stat-label">Occupation</div></div>
          <div className="stat-card"><div className="stat-value">{stats.reeferCount}</div><div className="stat-label">Reefers</div></div>
          <div className="stat-card"><div className="stat-value">{stats.multiStacks}</div><div className="stat-label">Piles ≥ 2</div></div>
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Historique des mouvements</h3>
        <div className="move-log">
          {moveHistory.length === 0 ? (
            <div className="move-log-empty">Aucun mouvement. Glissez un conteneur pour le repositionner.</div>
          ) : (
            moveHistory.slice(0, 20).map((m, i) => {
              const timeStr = m.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div className="move-entry" key={i}>
                  <div className="move-entry-icon">↗</div>
                  <div className="move-entry-text">
                    <strong>{m.ct.id}</strong><br />
                    {posLabel(m.fromZone, m.fromRow, m.fromCol)} → {posLabel(m.toZone, m.toRow, m.toCol)}
                  </div>
                  <span className="move-entry-time">{timeStr}</span>
                  <button className="move-entry-undo" onClick={() => undoMove(i)}>Annuler</button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
