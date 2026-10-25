import { TYPES } from '../data/config';
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
  all: 'Tous les conteneurs',
  'empty-20': "Vide · 20'",
  'empty-40': "Vide · 40'",
  'full-20': "Plein · 20'",
  'full-40': "Plein · 40'",
  'reefer': 'Reefer · Vide',
  'reefer-full': 'Reefer · Plein',
};

export default function Sidebar({ containers, onLocate, stats, activeFilter, setActiveFilter, searchQuery, setSearchQuery, moveHistory, undoMove, onSelectEntry }) {
  const filters = ['all', ...TYPES];
  const query = searchQuery.trim().toUpperCase();
  const matches = query.length >= 3 ? containers.filter(ct => ct.id.toUpperCase().includes(query)) : [];


  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3>Recherche conteneur</h3>
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            aria-label="Rechercher un conteneur"
            placeholder="N° de conteneur…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        {query.length >= 3 && <div className="search-results">
          <p role="status">{matches.length ? `${matches.length} résultat(s) dans le parc` : 'Aucun conteneur trouvé.'}</p>
          {matches.slice(0, 20).map(ct => <button key={ct._dbId ?? ct.id} onClick={() => onLocate(ct)}>
            <strong>{ct.id}</strong><span>{posLabel(ct.zone, ct.row, ct.col)} · Niveau {ct.tier}</span><span className="search-locate">Localiser →</span>
          </button>)}
          {matches.length > 20 && <p>Affinez la recherche pour voir les autres résultats.</p>}
        </div>}
      </div>

      <div className="sidebar-section">
        <h3>Type de conteneur</h3>
        <div className="filter-group">
          {filters.map(f => (
            <button
              key={f}
              aria-pressed={activeFilter === f}
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
        <h3>Historique des mouvements</h3>
        <div className="move-log">
          {moveHistory.length === 0 ? (
            <div className="move-log-empty">Aucun mouvement. Glissez un conteneur pour le repositionner.</div>
          ) : (
            moveHistory.slice(0, 20).map((m, i) => {
              const timeStr = m.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div
                  className="move-entry clickable"
                  key={m.id ?? i}
                  role="button"
                  tabIndex={0}
                  title={`Voir ${m.ct.id} sur le plan et sa fiche`}
                  onClick={() => onSelectEntry(m)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectEntry(m); } }}
                >
                  <div className="move-entry-icon">↗</div>
                  <div className="move-entry-text">
                    <strong>{m.ct.id}</strong><br />
                    {posLabel(m.fromZone, m.fromRow, m.fromCol)} → {posLabel(m.toZone, m.toRow, m.toCol)}
                  </div>
                  <span className="move-entry-time">{timeStr}</span>
                  <button className="move-entry-undo" onClick={(e) => { e.stopPropagation(); undoMove(i); }}>Demander retour</button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
