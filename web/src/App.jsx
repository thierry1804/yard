import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useYardState } from './hooks/useYardState';
import { useAuth } from './hooks/useAuth';
import LoginScreen from './components/LoginScreen';
import './workspace.css';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import YardGrid from './components/YardGrid';
import StackPopup from './components/StackPopup';
import DetailPanel from './components/DetailPanel';
import ToastContainer from './components/ToastContainer';
import ZoneManager from './components/ZoneManager';
import MovementManager from './components/MovementManager';
import Dashboard from './components/Dashboard';
import ReeferMonitor from './components/ReeferMonitor';
import { resolveFocus } from './data/focus';
import { zoneStats } from './data/zoneStats';
const OperationsHub = lazy(() => import('./components/operations/OperationsHub'));

function App() {
  const { user, checking, sessionExpired, serverUnreachable, login, logout } = useAuth();
  const {
    refreshAll, stacks, zones, allContainers, loading,
    moveHistory, movementLog,
    activeFilter, setActiveFilter,
    zoneFilter, setZoneFilter,
    searchQuery, setSearchQuery,
    toasts, showToast,
    stackPopup, setStackPopup,
    detailContainer, setDetailContainer,
    executeMove, undoMove,
    addZone, editZone, deleteZone,
    containerArrival, containerDeparture, containerTransfer,
    stats,
    connectionStatus,
    movementsStamp,
  } = useYardState(!!user);

  const [operationsTab, setOperationsTab] = useState(null);
  const [compactView, setCompactView] = useState(true);
  const [showZoneManager, setShowZoneManager] = useState(false);
  const [showMovementManager, setShowMovementManager] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showReeferMonitor, setShowReeferMonitor] = useState(false);

  const visibleStats = zoneStats(zones, stacks, allContainers, zoneFilter);

  const zoneTabs = [
    { id: 'all', label: 'Toutes les zones' },
    ...zones.map(z => ({ id: z.id, label: `Zone ${z.id}` })),
  ];

  // Clicking a movement-history entry: open the container and pulse its slot.
  const [focusCell, setFocusCell] = useState(null);
  const focusTimer = useRef(null);
  const handleSelectEntry = useCallback((entry) => {
    const f = resolveFocus(entry, allContainers, zoneFilter);
    setZoneFilter(f.zoneFilter);
    setDetailContainer(f.container);
    clearTimeout(focusTimer.current);
    setFocusCell(f.highlight);
    if (f.highlight) focusTimer.current = setTimeout(() => setFocusCell(null), 3000);
  }, [allContainers, zoneFilter, setZoneFilter, setDetailContainer]);
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  const handleOpenDetail = useCallback((ct) => {
    setStackPopup(null);
    setTimeout(() => setDetailContainer(ct), 150);
  }, [setStackPopup, setDetailContainer]);

  // The open container follows live updates; once it leaves the yard the last
  // known snapshot stays visible, marked as departed.
  const liveDetail = detailContainer
    ? allContainers.find((c) => c._dbId === detailContainer._dbId) ?? { ...detailContainer, departed: true }
    : null;

  // Escape key handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setDetailContainer(null);
        setStackPopup(null);
        setShowZoneManager(false);
        setShowMovementManager(false);
        setShowDashboard(false);
        setShowReeferMonitor(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setDetailContainer, setStackPopup]);

  if (checking) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
        {serverUnreachable ? 'Serveur injoignable, nouvelle tentative dans quelques secondes…' : 'Chargement…'}
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={login} notice={sessionExpired ? 'Session expirée, reconnectez-vous.' : null} />;
  }

  return (
    <>
      <div className="app-shell" inert={operationsTab ? true : undefined}>
      <Header
        user={user}
        connectionStatus={connectionStatus}
        onLogout={logout}
        onOpenZoneManager={() => setShowZoneManager(true)}
        onOpenMovementManager={() => setShowMovementManager(true)}
        onOpenDashboard={() => setShowDashboard(true)}
        onOpenOperations={() => setOperationsTab('inventory')}
        onOpenReeferMonitor={() => setShowReeferMonitor(true)}
      />
      <div className={`app${compactView ? ' compact-view' : ''}`}>
        <Sidebar
          containers={allContainers}
          onLocate={(ct) => {
            setZoneFilter(ct.zone);
            setActiveFilter('all');
            clearTimeout(focusTimer.current);
            setFocusCell({ zone: ct.zone, row: ct.row, col: ct.col });
            focusTimer.current = setTimeout(() => setFocusCell(null), 3000);
            setDetailContainer(ct);
          }}
          stats={stats}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          moveHistory={moveHistory}
          undoMove={undoMove}
          onSelectEntry={handleSelectEntry}
        />
        <div className="main">
          <div className="yard-overview">
            <div><p className="workspace-eyebrow">EXPLOITATION · TOAMASINA</p><h2>Plan du parc</h2></div>
            <div className="overview-stats" aria-label={zoneFilter === 'all' ? 'Statistiques de toutes les zones' : `Statistiques de la zone ${zoneFilter}`} aria-live="polite">
              <div><strong>{visibleStats.totalContainers}</strong><span>Conteneurs</span></div>
              <div><strong>{visibleStats.occupancy}<small>%</small></strong><span>Occupation</span></div>
              <div><strong>{visibleStats.reeferCount}</strong><span>Reefers</span></div>
              <div><strong>{visibleStats.multiStacks}</strong><span>Piles ≥ 2</span></div>
            </div>
          </div>
          <div className="yard-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div className="yard-title">
                Emplacements
                {loading && <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: 12 }}>Synchronisation…</span>}
              </div>
              <div className="drag-hint">
                <span className="drag-hint-icon">↕</span>
                Glisser pour demander un déplacement · Clic pour consulter
              </div>
            </div>
            <div className="yard-controls">
              <div className="zone-tabs">
                {zoneTabs.map(tab => (
                  <button
                    key={tab.id}
                    aria-pressed={zoneFilter === tab.id}
                    className={`zone-tab${zoneFilter === tab.id ? ' active' : ''}`}
                    onClick={() => setZoneFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="compact-controls">
                <button className="density-btn" aria-pressed={compactView} onClick={() => setCompactView(!compactView)}>{compactView ? 'Vue détaillée' : 'Vue compacte'}</button>
                {zoneFilter !== 'all' ? (
                  <button
                    className="compact-btn"
                    onClick={() => setOperationsTab('reorganization')}
                  >
                    <span className="compact-icon">⧉</span>
                    Réorganiser {zoneFilter}
                  </button>
                ) : (
                  <button className="compact-btn" onClick={() => setOperationsTab('reorganization')}>
                    <span className="compact-icon">⧉</span>
                    Réorganiser le parc
                  </button>
                )}
              </div>
            </div>
          </div>
          {(activeFilter !== 'all' || searchQuery) && <div className="yard-filter-summary" role="status">
            <span>{searchQuery ? `Recherche : « ${searchQuery} »${searchQuery.trim().length < 3 ? ' · Saisissez au moins 3 caractères' : ` · ${allContainers.filter(ct => ct.id.toUpperCase().includes(searchQuery.trim().toUpperCase())).length} résultat(s)`}` : 'Filtre de type actif'} · Les autres emplacements restent visibles sur le plan.</span>
            <button onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}>Réinitialiser</button>
          </div>}
          <div className="yard-legend"><span><i className="legend-empty" />Vide</span><span><i className="legend-full" />Plein</span><span><i className="legend-reefer" />Reefer</span><span>Chiffre = conteneurs dans la pile · Barres = niveaux occupés · Couleur = conteneur au sommet</span></div>
          <YardGrid
            stacks={stacks}
            zones={zones}
            zoneFilter={zoneFilter}
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            executeMove={executeMove}
            showToast={showToast}
            setStackPopup={setStackPopup}
            onOpenDetail={setDetailContainer}
            focusCell={focusCell}
          />
        </div>
      </div>

      </div>
      {operationsTab && <Suspense fallback={<div className="modal-overlay" role="status">Chargement des opérations…</div>}><OperationsHub initialTab={operationsTab} zoneFilter={zoneFilter} containers={allContainers} stacks={stacks} zones={zones} user={user} onChanged={refreshAll} onClose={() => setOperationsTab(null)} onLocate={ct => {
        setOperationsTab(null); setZoneFilter(ct.zone); setActiveFilter('all'); setSearchQuery(''); setDetailContainer(ct);
        clearTimeout(focusTimer.current); setFocusCell({zone:ct.zone,row:ct.row,col:ct.col}); focusTimer.current=setTimeout(()=>setFocusCell(null),3000);
      }}/></Suspense>}
      {/* Tooltip */}
      <div className="tooltip" id="tooltip"></div>

      {/* Stack Popup */}
      {stackPopup && (
        <StackPopup
          stackPopup={stackPopup}
          stacks={stacks}
          onClose={() => setStackPopup(null)}
          onOpenDetail={handleOpenDetail}
        />
      )}

      {/* Detail Panel */}
      <DetailPanel
        container={liveDetail}
        stacks={stacks}
        historyStamp={movementsStamp}
        onClose={() => setDetailContainer(null)}
        onOpenDetail={setDetailContainer}
      />

      {/* Zone Manager */}
      {showZoneManager && (
        <ZoneManager
          zones={zones}
          stacks={stacks}
          onClose={() => setShowZoneManager(false)}
          addZone={addZone}
          editZone={editZone}
          deleteZone={deleteZone}
        />
      )}

      {/* Movement Manager */}
      {showMovementManager && (
        <MovementManager
          zones={zones}
          stacks={stacks}
          allContainers={allContainers}
          onClose={() => setShowMovementManager(false)}
          containerArrival={containerArrival}
          containerDeparture={containerDeparture}
          containerTransfer={containerTransfer}
          movementLog={movementLog}
        />
      )}

      {/* Dashboard */}
      {showDashboard && (
        <Dashboard
          zones={zones}
          stacks={stacks}
          allContainers={allContainers}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {/* Reefer Monitor */}
      {showReeferMonitor && (
        <ReeferMonitor
          allContainers={allContainers}
          onClose={() => setShowReeferMonitor(false)}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} />
    </>
  );
}

export default App;
