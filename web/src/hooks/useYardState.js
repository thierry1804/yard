import { useState, useCallback, useEffect, useMemo } from 'react';
import { MAX_TIER, TYPES } from '../data/config';
import { posLabel } from '../data/generateData';
import { api, notifyUnauthorized } from '../api/client';
import { toApiType, toUiType } from '../api/typeMap';
import { connectYardSocket } from '../api/ws';
import { coalesce } from '../api/coalesce';

function toUiContainer(c) {
  return {
    id: c.containerNo,
    _dbId: c.id,
    type: toUiType(c.type),
    isoCode: c.isoCode,
    client: c.client ?? 'N/A',
    weight: c.weightKg != null ? `${c.weightKg} kg` : '—',
    zone: c.zoneId,
    row: c.row,
    col: c.col,
    tier: c.tier,
    version: c.version,
    customsStatus: c.customsStatus,
    releaseReference: c.releaseReference,
    releaseRequired: c.releaseRequired,
    clientHoldReason: c.clientHoldReason,
    entryDate: c.entryDate ? c.entryDate.slice(0, 10) : '',
    exitDate: c.plannedExitDate ? c.plannedExitDate.slice(0, 10) : '',
    reefer: c.reefer
      ? {
          commodity: c.reefer.commodity,
          setPoint: c.reefer.setPoint,
          tempMin: c.reefer.tempMin,
          tempMax: c.reefer.tempMax,
          currentTemp: c.reefer.currentTemp,
          powerStatus: c.reefer.powerStatus,
          ventSetting: c.reefer.ventSetting,
          humidity: c.reefer.humidity,
          lastTempUpdate: c.reefer.lastTempUpdate,
          tempAlert: c.reefer.tempAlert,
        }
      : null,
  };
}

function buildStacks(zones, containers) {
  const stacks = {};
  zones.forEach((z) => {
    stacks[z.id] = [];
    for (let r = 0; r < z.rows; r++) {
      stacks[z.id][r] = [];
      for (let c = 0; c < z.cols; c++) stacks[z.id][r][c] = [];
    }
  });
  containers.forEach((ct) => {
    if (!stacks[ct.zone]?.[ct.row]?.[ct.col]) return;
    stacks[ct.zone][ct.row][ct.col].push(ct);
  });
  Object.values(stacks).forEach((rows) =>
    rows.forEach((row) => row.forEach((stack) => stack.sort((a, b) => a.tier - b.tier))),
  );
  return stacks;
}

const ACTION_BY_MOVEMENT_TYPE = { ARRIVAL: 'arrival', DEPARTURE: 'departure', TRANSFER: 'transfer' };

export function useYardState(enabled) {
  const [zones, setZones] = useState([]);
  const [allContainers, setAllContainers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [stackPopup, setStackPopup] = useState(null);
  const [detailContainer, setDetailContainer] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('reconnecting');
  // Bumped on every movements refresh, so open views (container history) can refetch.
  const [movementsStamp, setMovementsStamp] = useState(0);

  const showToast = useCallback((type, message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const refreshZones = useCallback(async () => {
    const data = await api.getZones();
    setZones(data);
  }, []);

  const refreshContainers = useCallback(async () => {
    const data = await api.getContainers();
    setAllContainers(data.map(toUiContainer));
  }, []);

  const refreshMovements = useCallback(async () => {
    const [moves, operations] = await Promise.all([
      api.getMovements(20, 'moves'),
      api.getMovements(50, 'operations'),
    ]);
    setMovements([...moves, ...operations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setMovementsStamp((s) => s + 1);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([refreshZones(), refreshContainers(), refreshMovements()]);
    } catch (err) {
      if (err?.status !== 401) showToast('error', `Erreur de synchronisation : ${err.message}`);
    }
  }, [refreshZones, refreshContainers, refreshMovements, showToast]);

  const handleError = useCallback(
    (err) => {
      if (err?.code === 'VERSION_CONFLICT') {
        showToast('error', 'Modifié entre-temps par un autre utilisateur : affichage rechargé.');
        refreshAll();
        return;
      }
      if (err?.status === 401) return;
      showToast('error', err.message);
    },
    [showToast, refreshAll],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([refreshZones(), refreshContainers(), refreshMovements()]);
      } catch (err) {
        if (!cancelled) showToast('error', `Erreur de chargement : ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshZones, refreshContainers, refreshMovements, showToast]);

  useEffect(() => {
    if (!enabled) return;
    let zonesDirty = false;
    const refreshFromEvents = coalesce(async () => {
      const withZones = zonesDirty;
      zonesDirty = false;
      await Promise.all([refreshContainers(), refreshMovements(), withZones ? refreshZones() : null]);
    });
    const disconnect = connectYardSocket({
      getTicket: async () => (await api.wsTicket()).ticket,
      onEvent: (msg) => {
        // The per-depot dataset is small, so a full refetch is simpler and more
        // robust than patching each shape incrementally; coalesced so bursts
        // of events cost one in-flight refresh plus one follow-up.
        if (msg.event?.startsWith('yard.zone.')) zonesDirty = true;
        refreshFromEvents();
      },
      onConnected: refreshAll,
      onStatus: setConnectionStatus,
      onUnauthorized: notifyUnauthorized,
    });
    return disconnect;
  }, [enabled, refreshAll, refreshContainers, refreshMovements, refreshZones]);

  // Safety net while the websocket is down.
  useEffect(() => {
    if (!enabled || connectionStatus === 'connected') return;
    const id = setInterval(refreshAll, 60_000);
    return () => clearInterval(id);
  }, [enabled, connectionStatus, refreshAll]);

  const stacks = useMemo(() => buildStacks(zones, allContainers), [zones, allContainers]);

  const findByBusinessId = useCallback(
    (businessId) => allContainers.find((c) => c.id === businessId),
    [allContainers],
  );

  // ============ ZONE MANAGEMENT ============

  const addZone = useCallback(
    async (id, label, rows, cols) => {
      try {
        await api.createZone({ id, label, rows, cols });
        showToast('success', `Zone ${id} créée (${rows}x${cols}).`);
        await refreshZones();
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [handleError, showToast, refreshZones],
  );

  const editZone = useCallback(
    async (zoneId, newLabel, newRows, newCols) => {
      try {
        const zone = zones.find((z) => z.id === zoneId);
        await api.updateZone(zoneId, { label: newLabel, rows: newRows, cols: newCols, expectedVersion: zone?.version });
        showToast('success', `Zone ${zoneId} modifiée.`);
        await refreshZones();
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [handleError, showToast, refreshZones, zones],
  );

  const deleteZone = useCallback(
    async (zoneId) => {
      try {
        await api.deleteZone(zoneId);
        showToast('success', `Zone ${zoneId} supprimée.`);
        if (zoneFilter === zoneId) setZoneFilter('all');
        await refreshZones();
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [handleError, showToast, refreshZones, zoneFilter],
  );

  // ============ CONTAINER MOVEMENTS ============

  const containerArrival = useCallback(
    async (opts) => {
      const { id, type, client, weight, zoneId, row, col, plannedExitDate } = opts;
      try {
        const weightKg = weight ? parseInt(String(weight).replace(/[^\d]/g, ''), 10) : undefined;
        const created = await api.containerArrival({
          containerNo: id || undefined,
          type: toApiType(type),
          client,
          weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
          zoneId,
          row,
          col,
          plannedExitDate: plannedExitDate || undefined,
        });
        showToast('success', `Arrivée : ${created.containerNo} placé à ${posLabel(zoneId, row, col)}.`);
        await Promise.all([refreshContainers(), refreshMovements()]);
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [handleError, showToast, refreshContainers, refreshMovements],
  );

  const containerDeparture = useCallback(
    async (containerId) => {
      const ct = findByBusinessId(containerId);
      if (!ct) {
        showToast('error', `Conteneur ${containerId} introuvable.`);
        return false;
      }
      try {
        await api.opsWrite('tasks', { kind: 'DEPARTURE', containerId: ct._dbId });
        showToast('success', `Sortie demandée pour ${containerId}. À confirmer dans Opérations → Tâches terrain.`);
        await Promise.all([refreshContainers(), refreshMovements()]);
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [findByBusinessId, handleError, showToast, refreshContainers, refreshMovements],
  );

  const containerTransfer = useCallback(
    async (containerId, targetZoneId) => {
      const ct = findByBusinessId(containerId);
      if (!ct) {
        showToast('error', `Conteneur ${containerId} introuvable.`);
        return false;
      }
      try {
        const fromPos = posLabel(ct.zone, ct.row, ct.col);
        const updated = await api.opsWrite('tasks', { kind: 'MOVE', containerId: ct._dbId, targetZoneId });
        showToast(
          'success',
          `Transfert demandé : ${containerId} de ${fromPos} → ${posLabel(updated.targetZoneId, updated.targetRow, updated.targetCol)}. À confirmer dans Opérations.`,
        );
        await Promise.all([refreshContainers(), refreshMovements()]);
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [findByBusinessId, handleError, showToast, refreshContainers, refreshMovements],
  );

  // ============ DRAG & DROP MOVE ============

  const executeMove = useCallback(
    async (ct, fromZone, fromRow, fromCol, toZone, toRow, toCol, addToHistory) => {
      try {
        await api.opsWrite('tasks', { kind: 'MOVE', containerId: ct._dbId, targetZoneId: toZone, targetRow: toRow, targetCol: toCol });
        if (addToHistory) {
          showToast('success', `${ct.id} : tâche de déplacement demandée vers ${posLabel(toZone, toRow, toCol)}. À confirmer dans Opérations.`);
        }
        await Promise.all([refreshContainers(), refreshMovements()]);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, showToast, refreshContainers, refreshMovements],
  );

  const moveHistory = useMemo(
    () =>
      movements
        .filter((m) => m.type === 'MOVE' && !m.undoneAt)
        .slice(0, 20)
        .map((m) => ({
          id: m.id,
          ct: { id: m.container.containerNo, _dbId: m.container.id, type: toUiType(m.container.type) },
          fromZone: m.fromZoneId,
          fromRow: m.fromRow,
          fromCol: m.fromCol,
          toZone: m.toZoneId,
          toRow: m.toRow,
          toCol: m.toCol,
          time: new Date(m.createdAt),
        })),
    [movements],
  );

  const undoMove = useCallback(
    async (index) => {
      const move = moveHistory[index];
      if (!move) return;
      try {
        await api.opsWrite('tasks', {kind:'MOVE',containerId:move.ct._dbId,targetZoneId:move.fromZone,targetRow:move.fromRow,targetCol:move.fromCol,reason:'Demande de retour depuis l’historique'});
        showToast('info', `Retour demandé pour ${move.ct.id} vers ${posLabel(move.fromZone, move.fromRow, move.fromCol)}. À confirmer dans les tâches terrain.`);
        await Promise.all([refreshContainers(), refreshMovements()]);
      } catch (err) {
        handleError(err);
      }
    },
    [moveHistory, handleError, showToast, refreshContainers, refreshMovements],
  );

  const movementLog = useMemo(
    () =>
      movements
        .filter((m) => ACTION_BY_MOVEMENT_TYPE[m.type])
        .slice(0, 50)
        .map((m) => ({
          action: ACTION_BY_MOVEMENT_TYPE[m.type],
          ct: { id: m.container.containerNo, type: toUiType(m.container.type) },
          position: m.toZoneId
            ? posLabel(m.toZoneId, m.toRow, m.toCol)
            : m.fromZoneId
              ? posLabel(m.fromZoneId, m.fromRow, m.fromCol)
              : '',
          fromPosition: m.type === 'TRANSFER' && m.fromZoneId ? posLabel(m.fromZoneId, m.fromRow, m.fromCol) : undefined,
          time: new Date(m.createdAt),
        })),
    [movements],
  );

  // ============ COMPACT ============

  const handleCompactZone = useCallback(
    async (zoneId) => {
      try {
        const { count } = await api.compactZone(zoneId);
        if (count === 0) {
          showToast('info', `Zone ${zoneId} : rien à réorganiser.`);
          return;
        }
        showToast('success', `Zone ${zoneId} compactée : ${count} conteneurs réorganisés.`);
        await Promise.all([refreshContainers(), refreshMovements()]);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, showToast, refreshContainers, refreshMovements],
  );

  const handleCompactAll = useCallback(async () => {
    try {
      const { total } = await api.compactAll();
      if (total === 0) {
        showToast('info', 'Le yard est déjà compact.');
        return;
      }
      showToast('success', `Yard compacté : ${total} conteneurs réorganisés.`);
      await Promise.all([refreshContainers(), refreshMovements()]);
    } catch (err) {
      handleError(err);
    }
  }, [handleError, showToast, refreshContainers, refreshMovements]);

  // ============ REEFER ============

  const updateReefer = useCallback(
    async (containerId, data) => {
      const ct = findByBusinessId(containerId);
      if (!ct) return false;
      try {
        await api.updateReefer(ct._dbId, { ...data, expectedVersion: ct.version });
        await refreshContainers();
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [findByBusinessId, handleError, showToast, refreshContainers],
  );

  // ============ STATS ============

  const totalContainers = allContainers.length;
  const totalSlots = zones.reduce((s, z) => s + (z.rows * z.cols - (z.blockedSlots?.length || 0)) * (z.maxTier ?? MAX_TIER), 0);
  const occupancy = totalSlots > 0 ? Math.round((totalContainers / totalSlots) * 100) : 0;
  const reeferCount = allContainers.filter((c) => c.type.includes('reefer')).length;
  let multiStacks = 0;
  zones.forEach((z) => {
    if (!stacks[z.id]) return;
    for (let r = 0; r < z.rows; r++)
      for (let c = 0; c < z.cols; c++) if (stacks[z.id][r]?.[c]?.length >= 2) multiStacks++;
  });

  const typeCounts = {};
  TYPES.forEach((t) => {
    typeCounts[t] = allContainers.filter((c) => c.type === t).length;
  });

  return {
    refreshAll,
    stacks, allContainers, zones, loading,
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
    compactZone: handleCompactZone, compactAll: handleCompactAll,
    updateReefer,
    stats: { totalContainers, occupancy, reeferCount, multiStacks, typeCounts },
    connectionStatus,
    movementsStamp,
  };
}
