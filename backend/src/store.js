// In-memory yard state persisted to a JSON file. The dataset for one depot is
// small (a few hundred containers), so a full rewrite on every mutation is fine.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_TIER = 3;

export const CONTAINER_TYPES = ['EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40', 'REEFER', 'REEFER_FULL'];

export const ISO_CODES = {
  EMPTY_20: '22G0',
  EMPTY_40: '42G0',
  FULL_20: '22G1',
  FULL_40: '42G1',
  REEFER: '22R0',
  REEFER_FULL: '42R1',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Mirrors the frontend rule (src/data/rules.js getSize): only types whose name
// contains "20" are 20', everything else stacks as a 40'.
export function sizeOf(type) {
  return type.includes('20') ? 20 : 40;
}

export function isReefer(type) {
  return type.startsWith('REEFER');
}

export function posLabel(z, r, c) {
  return `${z}-Bay${String(c + 1).padStart(2, '0')}-R${String(r + 1).padStart(2, '0')}`;
}

export function computeTempAlert(reefer) {
  if (!reefer) return false;
  if (reefer.powerStatus === 'off') return true;
  return reefer.currentTemp < reefer.tempMin || reefer.currentTemp > reefer.tempMax;
}

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: [], zones: [], containers: [], movements: [] };
    this.saveTimer = null;
  }

  exists() {
    return existsSync(this.file);
  }

  load() {
    this.data = JSON.parse(readFileSync(this.file, 'utf8'));
  }

  replace(data) {
    this.data = data;
    this.saveNow();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 200);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  // ---------- lookups ----------

  get zones() {
    return this.data.zones;
  }

  get containers() {
    return this.data.containers;
  }

  findUserByEmail(email) {
    return this.data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  }

  findUser(id) {
    return this.data.users.find((u) => u.id === id);
  }

  getZone(id) {
    const zone = this.data.zones.find((z) => z.id === id);
    if (!zone) throw new HttpError(404, `Zone ${id} introuvable.`);
    return zone;
  }

  getContainer(id) {
    const ct = this.data.containers.find((c) => c.id === id || c.containerNo === id);
    if (!ct) throw new HttpError(404, `Conteneur ${id} introuvable.`);
    return ct;
  }

  stackAt(zoneId, row, col) {
    return this.data.containers
      .filter((c) => c.zoneId === zoneId && c.row === row && c.col === col)
      .sort((a, b) => a.tier - b.tier);
  }

  isTop(ct) {
    const stack = this.stackAt(ct.zoneId, ct.row, ct.col);
    return stack[stack.length - 1]?.id === ct.id;
  }

  // Throws with a user-facing reason when `type` cannot be put on top of the
  // stack at (zoneId,row,col). `ignoreId` lets a container be re-placed onto
  // the slot it is currently leaving.
  assertCanPlace(zoneId, row, col, type, ignoreId) {
    const zone = this.getZone(zoneId);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= zone.rows || col >= zone.cols) {
      throw new HttpError(400, `Position ${zoneId} R${row + 1} Bay${col + 1} hors de la zone.`);
    }
    const stack = this.stackAt(zoneId, row, col).filter((c) => c.id !== ignoreId);
    if (stack.length >= MAX_TIER) {
      throw new HttpError(409, `Pile pleine à ${posLabel(zoneId, row, col)} (${MAX_TIER} niveaux max).`);
    }
    if (sizeOf(type) === 40 && stack.some((c) => sizeOf(c.type) === 20)) {
      throw new HttpError(409, `Interdit : un 40' ne peut pas être posé sur un 20' (${posLabel(zoneId, row, col)}).`);
    }
    return stack.length + 1;
  }

  findFirstSlot(zoneId, type) {
    const zone = this.getZone(zoneId);
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        try {
          this.assertCanPlace(zoneId, r, c, type);
          return { row: r, col: c };
        } catch {
          // slot not usable, try the next one
        }
      }
    }
    return null;
  }

  generateContainerNo() {
    const carriers = ['MSCU', 'CMAU', 'MAEU', 'HLCU', 'OOLU', 'EISU', 'TCLU', 'MSKU', 'ONEU', 'CSLU'];
    for (;;) {
      const no = carriers[Math.floor(Math.random() * carriers.length)] + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
      if (!this.data.containers.some((c) => c.containerNo === no)) return no;
    }
  }

  // ---------- movements ----------

  recordMovement(type, ct, from, to, userId) {
    const movement = {
      id: randomUUID(),
      type,
      containerId: ct.id,
      container: { id: ct.id, containerNo: ct.containerNo, type: ct.type },
      fromZoneId: from?.zoneId ?? null,
      fromRow: from?.row ?? null,
      fromCol: from?.col ?? null,
      fromTier: from?.tier ?? null,
      toZoneId: to?.zoneId ?? null,
      toRow: to?.row ?? null,
      toCol: to?.col ?? null,
      toTier: to?.tier ?? null,
      userId: userId ?? null,
      createdAt: new Date().toISOString(),
      undoneAt: null,
    };
    this.data.movements.unshift(movement);
    if (this.data.movements.length > 2000) this.data.movements.length = 2000;
    return movement;
  }

  listMovements(take = 50) {
    return this.data.movements.slice(0, take);
  }

  // ---------- zones ----------

  createZone({ id, label, rows, cols }) {
    id = String(id ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,4}$/.test(id)) throw new HttpError(400, 'Identifiant de zone invalide (1 à 4 caractères alphanumériques).');
    if (this.data.zones.some((z) => z.id === id)) throw new HttpError(409, `La zone ${id} existe déjà.`);
    assertDims(rows, cols);
    const zone = { id, label: label?.trim() || `Zone ${id}`, rows, cols, createdAt: new Date().toISOString() };
    this.data.zones.push(zone);
    this.save();
    return zone;
  }

  updateZone(id, { label, rows, cols }) {
    const zone = this.getZone(id);
    const newRows = rows ?? zone.rows;
    const newCols = cols ?? zone.cols;
    assertDims(newRows, newCols);
    const outside = this.data.containers.filter((c) => c.zoneId === id && (c.row >= newRows || c.col >= newCols));
    if (outside.length > 0) {
      throw new HttpError(409, `Impossible de réduire la zone ${id} : ${outside.length} conteneur(s) hors des nouvelles dimensions.`);
    }
    if (label != null) zone.label = String(label).trim() || zone.label;
    zone.rows = newRows;
    zone.cols = newCols;
    this.save();
    return zone;
  }

  deleteZone(id) {
    this.getZone(id);
    const count = this.data.containers.filter((c) => c.zoneId === id).length;
    if (count > 0) throw new HttpError(409, `Impossible de supprimer la zone ${id} : elle contient ${count} conteneur(s).`);
    this.data.zones = this.data.zones.filter((z) => z.id !== id);
    this.save();
  }

  // Same strategy as the frontend prototype (src/data/rules.js compactZone):
  // 40' first then 20', latest exit date at the bottom so the earliest
  // departures end up on top and stay accessible.
  compactZone(zoneId, userId) {
    const zone = this.getZone(zoneId);
    const cts = this.data.containers.filter((c) => c.zoneId === zoneId);
    if (cts.length === 0) return 0;

    const byExitDesc = (a, b) => (b.plannedExitDate || '').localeCompare(a.plannedExitDate || '');
    const groups = [
      cts.filter((c) => sizeOf(c.type) === 40).sort(byExitDesc),
      cts.filter((c) => sizeOf(c.type) === 20).sort(byExitDesc),
    ];

    const before = new Map(cts.map((c) => [c.id, { zoneId: c.zoneId, row: c.row, col: c.col, tier: c.tier }]));
    const totalSlots = zone.rows * zone.cols;
    let slot = 0;
    // Each size group starts on a fresh slot so a 40' never lands on a 20'.
    for (const group of groups) {
      let j = 0;
      while (j < group.length && slot < totalSlots) {
        for (let tier = 1; tier <= MAX_TIER && j < group.length; tier++, j++) {
          const ct = group[j];
          ct.row = Math.floor(slot / zone.cols);
          ct.col = slot % zone.cols;
          ct.tier = tier;
        }
        slot++;
      }
    }

    for (const ct of cts) {
      const from = before.get(ct.id);
      if (from.row !== ct.row || from.col !== ct.col || from.tier !== ct.tier) {
        this.recordMovement('COMPACT', ct, from, { zoneId, row: ct.row, col: ct.col, tier: ct.tier }, userId);
      }
    }
    this.save();
    return cts.length;
  }

  // ---------- containers ----------

  arrival(body, userId) {
    const type = body.type;
    if (!CONTAINER_TYPES.includes(type)) throw new HttpError(400, `Type de conteneur invalide : ${type}.`);

    let containerNo = body.containerNo ? String(body.containerNo).trim().toUpperCase() : this.generateContainerNo();
    if (!/^[A-Z]{4}\d{7}$/.test(containerNo)) throw new HttpError(400, `Numéro de conteneur invalide : ${containerNo} (format attendu : 4 lettres + 7 chiffres).`);
    if (this.data.containers.some((c) => c.containerNo === containerNo)) {
      throw new HttpError(409, `Le conteneur ${containerNo} est déjà présent dans le yard.`);
    }

    const zoneId = body.zoneId;
    let { row, col } = body;
    if (row == null || col == null) {
      const slot = this.findFirstSlot(zoneId, type);
      if (!slot) throw new HttpError(409, `Aucun emplacement disponible en zone ${zoneId}.`);
      ({ row, col } = slot);
    }
    const tier = this.assertCanPlace(zoneId, row, col, type);

    const now = new Date();
    const ct = {
      id: randomUUID(),
      containerNo,
      type,
      isoCode: ISO_CODES[type],
      client: body.client || null,
      weightKg: Number.isFinite(body.weightKg) ? body.weightKg : null,
      zoneId,
      row,
      col,
      tier,
      entryDate: now.toISOString(),
      plannedExitDate: body.plannedExitDate ? new Date(body.plannedExitDate).toISOString() : null,
      reefer: isReefer(type) ? defaultReefer(now) : null,
    };
    this.data.containers.push(ct);
    this.recordMovement('ARRIVAL', ct, null, { zoneId, row, col, tier }, userId);
    this.save();
    return ct;
  }

  departure(id, userId) {
    const ct = this.getContainer(id);
    if (!this.isTop(ct)) {
      throw new HttpError(409, `${ct.containerNo} n'est pas au sommet de sa pile : retirez d'abord les conteneurs au-dessus.`);
    }
    this.data.containers = this.data.containers.filter((c) => c.id !== ct.id);
    this.recordMovement('DEPARTURE', ct, { zoneId: ct.zoneId, row: ct.row, col: ct.col, tier: ct.tier }, null, userId);
    this.save();
    return ct;
  }

  transfer(id, targetZoneId, userId) {
    const ct = this.getContainer(id);
    this.getZone(targetZoneId);
    if (ct.zoneId === targetZoneId) throw new HttpError(400, `${ct.containerNo} est déjà en zone ${targetZoneId}.`);
    if (!this.isTop(ct)) throw new HttpError(409, `${ct.containerNo} n'est pas au sommet de sa pile.`);
    const slot = this.findFirstSlot(targetZoneId, ct.type);
    if (!slot) throw new HttpError(409, `Aucun emplacement disponible en zone ${targetZoneId}.`);
    return this.relocate(ct, targetZoneId, slot.row, slot.col, 'TRANSFER', userId);
  }

  move(id, toZoneId, toRow, toCol, userId) {
    const ct = this.getContainer(id);
    if (ct.zoneId === toZoneId && ct.row === toRow && ct.col === toCol) {
      throw new HttpError(400, 'Le conteneur est déjà à cet emplacement.');
    }
    if (!this.isTop(ct)) throw new HttpError(409, `Seul le conteneur du sommet peut être déplacé (${ct.containerNo}).`);
    return this.relocate(ct, toZoneId, toRow, toCol, 'MOVE', userId);
  }

  relocate(ct, zoneId, row, col, movementType, userId) {
    const tier = this.assertCanPlace(zoneId, row, col, ct.type, ct.id);
    const from = { zoneId: ct.zoneId, row: ct.row, col: ct.col, tier: ct.tier };
    Object.assign(ct, { zoneId, row, col, tier });
    this.recordMovement(movementType, ct, from, { zoneId, row, col, tier }, userId);
    this.save();
    return ct;
  }

  undoMovement(movementId, userId) {
    const m = this.data.movements.find((x) => x.id === movementId);
    if (!m) throw new HttpError(404, 'Mouvement introuvable.');
    if (m.type !== 'MOVE') throw new HttpError(400, 'Seuls les déplacements (drag & drop) peuvent être annulés.');
    if (m.undoneAt) throw new HttpError(409, 'Ce mouvement a déjà été annulé.');

    const ct = this.data.containers.find((c) => c.id === m.containerId);
    if (!ct) throw new HttpError(409, `${m.container.containerNo} n'est plus dans le yard.`);
    if (ct.zoneId !== m.toZoneId || ct.row !== m.toRow || ct.col !== m.toCol) {
      throw new HttpError(409, `${ct.containerNo} a été déplacé depuis : annulation impossible.`);
    }
    if (!this.isTop(ct)) throw new HttpError(409, `${ct.containerNo} n'est plus au sommet de sa pile.`);

    const tier = this.assertCanPlace(m.fromZoneId, m.fromRow, m.fromCol, ct.type, ct.id);
    Object.assign(ct, { zoneId: m.fromZoneId, row: m.fromRow, col: m.fromCol, tier });
    m.undoneAt = new Date().toISOString();
    m.undoneBy = userId ?? null;
    this.save();
    return ct;
  }

  updateReefer(id, patch) {
    const ct = this.getContainer(id);
    if (!ct.reefer) throw new HttpError(400, `${ct.containerNo} n'est pas un reefer.`);
    const allowed = ['commodity', 'setPoint', 'tempMin', 'tempMax', 'currentTemp', 'powerStatus', 'ventSetting', 'humidity'];
    for (const key of allowed) {
      if (patch[key] !== undefined) ct.reefer[key] = patch[key];
    }
    if (patch.powerStatus !== undefined && !['on', 'off'].includes(ct.reefer.powerStatus)) {
      throw new HttpError(400, "powerStatus doit valoir 'on' ou 'off'.");
    }
    if (patch.currentTemp !== undefined) ct.reefer.lastTempUpdate = new Date().toISOString();
    ct.reefer.tempAlert = computeTempAlert(ct.reefer);
    this.save();
    return ct;
  }
}

function assertDims(rows, cols) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 30 || cols > 40) {
    throw new HttpError(400, 'Dimensions invalides (rangées 1–30, baies 1–40).');
  }
}

export const REEFER_COMMODITIES = [
  { name: 'Fruits tropicaux', setPoint: 13, min: 10, max: 15 },
  { name: 'Viande congelée', setPoint: -18, min: -22, max: -15 },
  { name: 'Produits laitiers', setPoint: 4, min: 2, max: 6 },
  { name: 'Poisson frais', setPoint: -1, min: -3, max: 1 },
  { name: 'Chocolat', setPoint: 16, min: 14, max: 18 },
  { name: 'Vaccins', setPoint: 5, min: 2, max: 8 },
  { name: 'Légumes frais', setPoint: 7, min: 4, max: 10 },
  { name: 'Surgelés', setPoint: -25, min: -30, max: -20 },
];

export function defaultReefer(now = new Date(), commodity = REEFER_COMMODITIES[Math.floor(Math.random() * REEFER_COMMODITIES.length)]) {
  const currentTemp = Math.round((commodity.setPoint + (Math.random() - 0.5) * 2) * 10) / 10;
  const reefer = {
    commodity: commodity.name,
    setPoint: commodity.setPoint,
    tempMin: commodity.min,
    tempMax: commodity.max,
    currentTemp,
    powerStatus: 'on',
    ventSetting: `${[0, 10, 15, 25][Math.floor(Math.random() * 4)]} CBM/H`,
    humidity: `${Math.floor(60 + Math.random() * 30)}%`,
    lastTempUpdate: now.toISOString(),
    tempAlert: false,
  };
  reefer.tempAlert = computeTempAlert(reefer);
  return reefer;
}
