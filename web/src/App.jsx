import { useState, useEffect, useCallback, useRef } from 'react';
import { useYardState } from './hooks/useYardState';
import { useAuth } from './hooks/useAuth';
import LoginScreen from './components/LoginScreen';
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

function App() {
  const { user, checking, sessionExpired, serverUnreachable, login, logout } = useAuth();
  const {
    stacks, zones, allContainers, loading,
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
    compactZone: compactZoneAction, compactAll,
    stats,
    connectionStatus,
    movementsStamp,
  } = useYardState(!!user);

  const [showZoneManager, setShowZoneManager] = useState(false);
  const [showMovementManager, setShowMovementManager] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showReeferMonitor, setShowReeferMonitor] = useState(false);

  const zoneTabs = [
    { id: 'all', label: 'Tout' },
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
      <Header
        user={user}
        connectionStatus={connectionStatus}
        onLogout={logout}
        onOpenZoneManager={() => setShowZoneManager(true)}
        onOpenMovementManager={() => setShowMovementManager(true)}
        onOpenDashboard={() => setShowDashboard(true)}
        onOpenReeferMonitor={() => setShowReeferMonitor(true)}
      />
      <div className="app">
        <Sidebar
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
          <div className="yard-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div className="yard-title">
                Plan du Yard — Drag & Drop activé
                {loading && <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: 12 }}>Synchronisation…</span>}
              </div>
              <div className="drag-hint">
                <span className="drag-hint-icon">↕</span>
                Glissez le conteneur du sommet vers un autre emplacement
              </div>
            </div>
            <div className="yard-controls">
              <div className="zone-tabs">
                {zoneTabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`zone-tab${zoneFilter === tab.id ? ' active' : ''}`}
                    onClick={() => setZoneFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="compact-controls">
                {zoneFilter !== 'all' ? (
                  <button
                    className="compact-btn"
                    onClick={() => compactZoneAction(zoneFilter)}
                  >
                    <span className="compact-icon">⧉</span>
                    Compacter {zoneFilter}
                  </button>
                ) : (
                  <button className="compact-btn" onClick={compactAll}>
                    <span className="compact-icon">⧉</span>
                    Compacter tout
                  </button>
                )}
              </div>
            </div>
          </div>
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
