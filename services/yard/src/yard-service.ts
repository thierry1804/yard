import type { Actor, ContainerType } from '@ccis/contracts';
import { errors } from '@ccis/service-kit';
import { Prisma, type Container, type Movement, type PrismaClient, type ReeferState, type Zone } from './generated/prisma';
import { emit, positionOf, snapshot } from './events';
import { lockSlots, lockZones } from './locks';
import {
  CONTAINER_NO_RE, ISO_CODES, ZONE_ID_RE, isReefer, normalizeContainerNo, placementError, planCompaction, posLabel, zoneDimsError,
} from './domain/rules';
import { computeTempAlert, defaultReefer } from './domain/reefer';

type Tx = Prisma.TransactionClient;

export interface Ctx {
  actor: Actor;
  correlationId: string;
  userEmail?: string;
}

export type ContainerWithReefer = Container & { reefer: ReeferState | null };

export interface ArrivalInput {
  containerNo?: string;
  type: ContainerType;
  client?: string;
  weightKg?: number;
  zoneId: string;
  row?: number;
  col?: number;
  plannedExitDate?: string;
}

export interface ReeferPatch {
  commodity?: string;
  setPoint?: number;
  tempMin?: number;
  tempMax?: number;
  currentTemp?: number;
  powerStatus?: 'on' | 'off';
  ventSetting?: string;
  humidity?: string;
  expectedVersion?: number;
}

interface Pos {
  zoneId: string;
  row: number;
  col: number;
  tier: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARRIERS = ['MSCU', 'CMAU', 'MAEU', 'HLCU', 'OOLU', 'EISU', 'TCLU', 'MSKU', 'ONEU', 'CSLU'];
const CONTAINER_CHANGED = 'Ce conteneur a été modifié par un autre utilisateur.';
const MAX_TX_ATTEMPTS = 3;

// Deadlocks and write conflicts are transient: the transaction is replayed.
function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code === 'P2034';
  return err instanceof Error && /deadlock detected|40P01/i.test(err.message);
}

export class YardService {
  constructor(private readonly prisma: PrismaClient, private readonly onCommitted: () => void = () => {}) {}

  // ---------- infrastructure ----------

  // maxWait + timeout stay below the gateway's upstream timeout (15 s), so a
  // client never gets a 503 for an operation that later commits.
  private async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this.prisma.$transaction(fn, { maxWait: 3_000, timeout: 10_000 });
        this.onCommitted();
        return result;
      } catch (err) {
        if (isRetryable(err) && attempt < MAX_TX_ATTEMPTS) continue;
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2002') {
            throw errors.ruleViolation('Emplacement ou numéro de conteneur pris entre-temps par une autre opération, réessayez.');
          }
          if (err.code === 'P2028') throw errors.serviceUnavailable('Le yard est momentanément occupé, réessayez.');
        }
        if (isRetryable(err)) throw errors.serviceUnavailable('Conflit avec une opération simultanée, réessayez.');
        throw err;
      }
    }
  }

  private async getZone(tx: Tx, id: string): Promise<Zone> {
    const zone = await tx.zone.findUnique({ where: { id } });
    if (!zone) throw errors.notFound(`Zone ${id} introuvable.`);
    return zone;
  }

  private async findPresent(tx: Tx, id: string): Promise<ContainerWithReefer> {
    const containerNo = normalizeContainerNo(id);
    if (!UUID_RE.test(id) && !CONTAINER_NO_RE.test(containerNo)) throw errors.notFound(`Conteneur ${id} introuvable.`);
    const where = UUID_RE.test(id) ? { id, status: 'PRESENT' as const } : { containerNo, status: 'PRESENT' as const };
    const ct = await tx.container.findFirst({ where, include: { reefer: true } });
    if (!ct) throw errors.notFound(`Conteneur ${id} introuvable.`);
    return ct;
  }

  // Reads the container, locks its zone (shared) and slot plus any extra
  // zones/slots, then re-reads it: if it moved meanwhile, the caller's view is
  // stale.
  private async lockContainer(
    tx: Tx,
    id: string,
    extra: { zones?: { zoneId: string; mode: 'shared' | 'exclusive' }[]; slots?: { zoneId: string; row: number; col: number }[] } = {},
  ): Promise<ContainerWithReefer> {
    const before = await this.findPresent(tx, id);
    await lockZones(tx, [{ zoneId: before.zoneId, mode: 'shared' }, ...(extra.zones ?? [])]);
    await lockSlots(tx, [before, ...(extra.slots ?? [])]);
    const ct = await this.findPresent(tx, before.id);
    if (ct.zoneId !== before.zoneId || ct.row !== before.row || ct.col !== before.col) {
      throw errors.versionConflict(CONTAINER_CHANGED);
    }
    return ct;
  }

  private stackAt(tx: Tx, zoneId: string, row: number, col: number): Promise<Container[]> {
    return tx.container.findMany({ where: { zoneId, row, col, status: 'PRESENT' }, orderBy: { tier: 'asc' } });
  }

  private async assertTop(tx: Tx, ct: Container): Promise<void> {
    const stack = await this.stackAt(tx, ct.zoneId, ct.row, ct.col);
    if (stack[stack.length - 1]?.id !== ct.id) {
      throw errors.ruleViolation(`Seul le conteneur du sommet peut être déplacé (${ct.containerNo}).`);
    }
  }

  private checkVersion(current: number, expected: number | undefined, message: string): void {
    if (expected !== undefined && expected !== current) throw errors.versionConflict(message);
  }

  private async placementTier(tx: Tx, zone: Zone, row: number, col: number, type: string, ignoreId?: string): Promise<number> {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= zone.rows || col >= zone.cols) {
      throw errors.validation(`Position ${posLabel(zone.id, row, col)} hors de la zone ${zone.id}.`);
    }
    const stack = (await this.stackAt(tx, zone.id, row, col)).filter((c) => c.id !== ignoreId);
    const reason = placementError(stack, type);
    if (reason) throw errors.ruleViolation(`${reason} (${posLabel(zone.id, row, col)}).`);
    return stack.length + 1;
  }

  private async firstFreeSlot(tx: Tx, zone: Zone, type: string): Promise<{ row: number; col: number } | null> {
    const present = await tx.container.findMany({ where: { zoneId: zone.id, status: 'PRESENT' }, select: { row: true, col: true, type: true } });
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        const stack = present.filter((p) => p.row === r && p.col === c);
        if (!placementError(stack, type)) return { row: r, col: c };
      }
    }
    return null;
  }

  // Optimistic update: fails if someone else bumped the version in between.
  private async writePosition(tx: Tx, ct: ContainerWithReefer, pos: Pos): Promise<ContainerWithReefer> {
    const res = await tx.container.updateMany({
      where: { id: ct.id, version: ct.version },
      data: { zoneId: pos.zoneId, row: pos.row, col: pos.col, tier: pos.tier, version: { increment: 1 } },
    });
    if (res.count === 0) throw errors.versionConflict(CONTAINER_CHANGED);
    return { ...ct, ...pos, version: ct.version + 1 };
  }

  private recordMovement(
    tx: Tx,
    type: Movement['type'],
    containerId: string,
    from: Pos | null,
    to: Pos | null,
    ctx: Ctx,
  ): Promise<Movement> {
    return tx.movement.create({
      data: {
        type,
        containerId,
        fromZoneId: from?.zoneId,
        fromRow: from?.row,
        fromCol: from?.col,
        fromTier: from?.tier,
        toZoneId: to?.zoneId,
        toRow: to?.row,
        toCol: to?.col,
        toTier: to?.tier,
        userId: ctx.actor?.userId,
        userEmail: ctx.userEmail,
      },
    });
  }

  private async generateContainerNo(tx: Tx): Promise<string> {
    for (;;) {
      const no = CARRIERS[Math.floor(Math.random() * CARRIERS.length)] + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
      if (!(await tx.container.findFirst({ where: { containerNo: no, status: 'PRESENT' } }))) return no;
    }
  }

  // ---------- zones ----------

  listZones(): Promise<Zone[]> {
    return this.prisma.zone.findMany({ orderBy: { id: 'asc' } });
  }

  async createZone(input: { id: string; label?: string; rows: number; cols: number }, ctx: Ctx): Promise<Zone> {
    const id = input.id.trim().toUpperCase();
    if (!ZONE_ID_RE.test(id)) throw errors.validation('Identifiant de zone invalide (1 à 4 caractères alphanumériques).');
    const dims = zoneDimsError(input.rows, input.cols);
    if (dims) throw errors.validation(dims);
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      if (await tx.zone.findUnique({ where: { id } })) throw errors.ruleViolation(`La zone ${id} existe déjà.`);
      const zone = await tx.zone.create({ data: { id, label: input.label?.trim() || `Zone ${id}`, rows: input.rows, cols: input.cols } });
      await emit(tx, ctx, 'yard.zone.created', { zone: zoneData(zone) }, zone);
      return zone;
    });
  }

  updateZone(id: string, input: { label?: string; rows?: number; cols?: number; expectedVersion?: number }, ctx: Ctx): Promise<Zone> {
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      const zone = await this.getZone(tx, id);
      this.checkVersion(zone.version, input.expectedVersion, 'Cette zone a été modifiée par un autre utilisateur.');
      const rows = input.rows ?? zone.rows;
      const cols = input.cols ?? zone.cols;
      const dims = zoneDimsError(rows, cols);
      if (dims) throw errors.validation(dims);
      const outside = await tx.container.count({
        where: { zoneId: id, status: 'PRESENT', OR: [{ row: { gte: rows } }, { col: { gte: cols } }] },
      });
      if (outside > 0) {
        throw errors.ruleViolation(`Impossible de réduire la zone ${id} : ${outside} conteneur(s) hors des nouvelles dimensions.`);
      }
      const label = input.label?.trim() || zone.label;
      const updated = await tx.zone.update({ where: { id }, data: { label, rows, cols, version: { increment: 1 } } });
      await emit(tx, ctx, 'yard.zone.updated', { zone: zoneData(updated) }, updated);
      return updated;
    });
  }

  deleteZone(id: string, ctx: Ctx): Promise<void> {
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      const zone = await this.getZone(tx, id);
      const count = await tx.container.count({ where: { zoneId: id, status: 'PRESENT' } });
      if (count > 0) throw errors.ruleViolation(`Impossible de supprimer la zone ${id} : elle contient ${count} conteneur(s).`);
      await tx.zone.delete({ where: { id } });
      await emit(tx, ctx, 'yard.zone.deleted', { zoneId: id }, { id, version: zone.version + 1 });
    });
  }

  // ---------- containers ----------

  listContainers(filter: { zoneId?: string; type?: string; q?: string }): Promise<ContainerWithReefer[]> {
    return this.prisma.container.findMany({
      where: {
        status: 'PRESENT',
        ...(filter.zoneId ? { zoneId: filter.zoneId } : {}),
        ...(filter.type ? { type: filter.type as ContainerType } : {}),
        ...(filter.q ? { containerNo: { contains: normalizeContainerNo(filter.q) } } : {}),
      },
      include: { reefer: true },
      orderBy: [{ zoneId: 'asc' }, { row: 'asc' }, { col: 'asc' }, { tier: 'asc' }],
    });
  }

  getContainer(idOrNo: string): Promise<ContainerWithReefer> {
    return this.findPresent(this.prisma, idOrNo);
  }

  async arrival(input: ArrivalInput, ctx: Ctx): Promise<ContainerWithReefer> {
    const plannedExitDate = parseOptionalDate(input.plannedExitDate);
    return this.tx(async (tx) => {
      const autoSlot = input.row === undefined || input.col === undefined;
      await lockZones(tx, [{ zoneId: input.zoneId, mode: autoSlot ? 'exclusive' : 'shared' }]);
      const zone = await this.getZone(tx, input.zoneId);

      const containerNo = input.containerNo ? normalizeContainerNo(input.containerNo) : await this.generateContainerNo(tx);
      if (!CONTAINER_NO_RE.test(containerNo)) {
        throw errors.validation(`Numéro de conteneur invalide : ${containerNo} (format attendu : 4 lettres + 7 chiffres).`);
      }
      if (await tx.container.findFirst({ where: { containerNo, status: 'PRESENT' } })) {
        throw errors.ruleViolation(`Le conteneur ${containerNo} est déjà présent dans le yard.`);
      }

      let row = input.row;
      let col = input.col;
      if (autoSlot) {
        const slot = await this.firstFreeSlot(tx, zone, input.type);
        if (!slot) throw errors.ruleViolation(`Aucun emplacement disponible en zone ${zone.id}.`);
        ({ row, col } = slot);
      } else {
        await lockSlots(tx, [{ zoneId: zone.id, row: row!, col: col! }]);
      }
      const tier = await this.placementTier(tx, zone, row!, col!, input.type);

      const now = new Date();
      const reefer = isReefer(input.type) ? defaultReefer(now) : null;
      const ct = await tx.container.create({
        data: {
          containerNo,
          type: input.type,
          isoCode: ISO_CODES[input.type],
          client: input.client ?? null,
          weightKg: input.weightKg ?? null,
          zoneId: zone.id,
          row: row!,
          col: col!,
          tier,
          entryDate: now,
          plannedExitDate,
          ...(reefer ? { reefer: { create: reefer } } : {}),
        },
        include: { reefer: true },
      });
      await this.recordMovement(tx, 'ARRIVAL', ct.id, null, positionOf(ct), ctx);
      await emit(tx, ctx, 'yard.container.arrived', { container: snapshot(ct) }, ct);
      if (ct.reefer) await emitReeferConfigured(tx, ctx, ct);
      return ct;
    });
  }

  departure(id: string, input: { expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const ct = await this.lockContainer(tx, id);
      this.checkVersion(ct.version, input.expectedVersion, CONTAINER_CHANGED);
      await this.assertTop(tx, ct);
      const exitDate = new Date();
      const res = await tx.container.updateMany({
        where: { id: ct.id, version: ct.version },
        data: { status: 'DEPARTED', exitDate, version: { increment: 1 } },
      });
      if (res.count === 0) throw errors.versionConflict(CONTAINER_CHANGED);
      const gone: ContainerWithReefer = { ...ct, status: 'DEPARTED', exitDate, version: ct.version + 1 };
      await this.recordMovement(tx, 'DEPARTURE', ct.id, positionOf(ct), null, ctx);
      await emit(tx, ctx, 'yard.container.departed', { container: snapshot(gone), from: positionOf(ct) }, gone);
      return gone;
    });
  }

  transfer(id: string, input: { targetZoneId: string; expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const ct = await this.lockContainer(tx, id, { zones: [{ zoneId: input.targetZoneId, mode: 'exclusive' }] });
      this.checkVersion(ct.version, input.expectedVersion, CONTAINER_CHANGED);
      if (ct.zoneId === input.targetZoneId) throw errors.validation(`${ct.containerNo} est déjà en zone ${input.targetZoneId}.`);
      const zone = await this.getZone(tx, input.targetZoneId);
      await this.assertTop(tx, ct);
      const slot = await this.firstFreeSlot(tx, zone, ct.type);
      if (!slot) throw errors.ruleViolation(`Aucun emplacement disponible en zone ${zone.id}.`);
      const tier = await this.placementTier(tx, zone, slot.row, slot.col, ct.type, ct.id);
      const from = positionOf(ct);
      const to = { zoneId: zone.id, row: slot.row, col: slot.col, tier };
      const updated = await this.writePosition(tx, ct, to);
      await this.recordMovement(tx, 'TRANSFER', ct.id, from, to, ctx);
      await emit(tx, ctx, 'yard.container.transferred', { container: snapshot(updated), from, to }, updated);
      return updated;
    });
  }

  move(id: string, input: { toZoneId: string; toRow: number; toCol: number; expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const target = { zoneId: input.toZoneId, row: input.toRow, col: input.toCol };
      const ct = await this.lockContainer(tx, id, { zones: [{ zoneId: target.zoneId, mode: 'shared' }], slots: [target] });
      this.checkVersion(ct.version, input.expectedVersion, CONTAINER_CHANGED);
      if (ct.zoneId === target.zoneId && ct.row === target.row && ct.col === target.col) {
        throw errors.validation('Le conteneur est déjà à cet emplacement.');
      }
      await this.assertTop(tx, ct);
      const zone = await this.getZone(tx, target.zoneId);
      const tier = await this.placementTier(tx, zone, target.row, target.col, ct.type, ct.id);
      const from = positionOf(ct);
      const to = { ...target, tier };
      const updated = await this.writePosition(tx, ct, to);
      await this.recordMovement(tx, 'MOVE', ct.id, from, to, ctx);
      await emit(tx, ctx, 'yard.container.moved', { container: snapshot(updated), from, to }, updated);
      return updated;
    });
  }

  undoMovement(movementId: string, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const m = UUID_RE.test(movementId) ? await tx.movement.findUnique({ where: { id: movementId } }) : null;
      if (!m) throw errors.notFound('Mouvement introuvable.');
      if (m.type !== 'MOVE') throw errors.validation('Seuls les déplacements (drag & drop) peuvent être annulés.');
      if (m.undoneAt) throw errors.ruleViolation('Ce mouvement a déjà été annulé.');
      const from = { zoneId: m.fromZoneId!, row: m.fromRow!, col: m.fromCol! };
      const ct = await this.lockContainer(tx, m.containerId, { zones: [{ zoneId: from.zoneId, mode: 'shared' }], slots: [from] }).catch(
        (err: unknown) => {
          if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'NOT_FOUND') {
            throw errors.ruleViolation("Le conteneur n'est plus dans le yard : annulation impossible.");
          }
          throw err;
        },
      );
      const fresh = await tx.movement.findUniqueOrThrow({ where: { id: movementId } });
      if (fresh.undoneAt) throw errors.ruleViolation('Ce mouvement a déjà été annulé.');
      const later = await tx.movement.count({
        where: { containerId: m.containerId, createdAt: { gt: m.createdAt }, undoneAt: null },
      });
      if (later > 0 || ct.zoneId !== m.toZoneId || ct.row !== m.toRow || ct.col !== m.toCol) {
        throw errors.ruleViolation(`${ct.containerNo} a été déplacé depuis : annulation impossible.`);
      }
      await this.assertTop(tx, ct);
      const zone = await this.getZone(tx, from.zoneId);
      const tier = await this.placementTier(tx, zone, from.row, from.col, ct.type, ct.id);
      const before = positionOf(ct);
      const to = { ...from, tier };
      const updated = await this.writePosition(tx, ct, to);
      await tx.movement.update({ where: { id: m.id }, data: { undoneAt: new Date(), undoneBy: ctx.actor?.userId, undoneByEmail: ctx.userEmail } });
      await emit(tx, ctx, 'yard.container.relocated', { container: snapshot(updated), from: before, to, reason: 'UNDO' }, updated);
      return updated;
    });
  }

  compactZone(zoneId: string, ctx: Ctx): Promise<number> {
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId, mode: 'exclusive' }]);
      return this.compactInTx(tx, await this.getZone(tx, zoneId), ctx);
    });
  }

  // All zones in one transaction: either the whole yard is compacted or nothing.
  compactAll(ctx: Ctx): Promise<number> {
    return this.tx(async (tx) => {
      const zones = await tx.zone.findMany({ orderBy: { id: 'asc' } });
      await lockZones(tx, zones.map((z) => ({ zoneId: z.id, mode: 'exclusive' as const })));
      let moved = 0;
      for (const zone of zones) moved += await this.compactInTx(tx, zone, ctx);
      return moved;
    });
  }

  // Returns the number of containers that actually changed position.
  private async compactInTx(tx: Tx, zone: Zone, ctx: Ctx): Promise<number> {
    const zoneId = zone.id;
    const cts = await tx.container.findMany({ where: { zoneId, status: 'PRESENT' }, include: { reefer: true }, orderBy: { id: 'asc' } });
    if (cts.length === 0) return 0;
    const plan = planCompaction(zone, cts);
    if (!plan) throw errors.ruleViolation(`Compactage impossible : la zone ${zoneId} est trop pleine.`);

    // Park every container on a unique temporary row first, so the partial
    // unique slot index never sees two containers on the same final slot.
    for (const [i, ct] of cts.entries()) {
      await tx.container.update({ where: { id: ct.id }, data: { row: -(i + 1) } });
    }
    let moved = 0;
    for (const ct of cts) {
      const target = plan.get(ct.id)!;
      const from = positionOf(ct);
      const to = { zoneId, ...target };
      const changed = from.row !== to.row || from.col !== to.col || from.tier !== to.tier;
      if (!changed) {
        await tx.container.update({ where: { id: ct.id }, data: { row: from.row } });
        continue;
      }
      moved++;
      const updated = await tx.container.update({
        where: { id: ct.id },
        data: { row: to.row, col: to.col, tier: to.tier, version: { increment: 1 } },
      });
      await this.recordMovement(tx, 'COMPACT', ct.id, from, to, ctx);
      await emit(tx, ctx, 'yard.container.relocated', { container: snapshot(updated), from, to, reason: 'COMPACT' }, updated);
    }
    return moved;
  }

  updateReefer(id: string, patch: ReeferPatch, ctx: Ctx): Promise<ContainerWithReefer> {
    const { expectedVersion, ...fields } = patch;
    return this.tx(async (tx) => {
      const ct = await this.lockContainer(tx, id);
      if (!ct.reefer) throw errors.ruleViolation(`${ct.containerNo} n'est pas un reefer.`);
      this.checkVersion(ct.version, expectedVersion, CONTAINER_CHANGED);
      const next = { ...ct.reefer, ...stripUndefined(fields) };
      if (next.tempMin > next.tempMax) throw errors.validation('La température min doit être inférieure ou égale à la max.');
      if (fields.currentTemp !== undefined) next.lastReadingAt = new Date();
      next.alert = computeTempAlert(next);
      const reefer = await tx.reeferState.update({
        where: { containerId: ct.id },
        data: {
          commodity: next.commodity,
          setPoint: next.setPoint,
          tempMin: next.tempMin,
          tempMax: next.tempMax,
          currentTemp: next.currentTemp,
          powerStatus: next.powerStatus,
          ventSetting: next.ventSetting,
          humidity: next.humidity,
          lastReadingAt: next.lastReadingAt,
          alert: next.alert,
        },
      });
      const res = await tx.container.updateMany({ where: { id: ct.id, version: ct.version }, data: { version: { increment: 1 } } });
      if (res.count === 0) throw errors.versionConflict(CONTAINER_CHANGED);
      const updated = { ...ct, version: ct.version + 1, reefer };
      await emitReeferConfigured(tx, ctx, updated);
      return updated;
    });
  }

  // ---------- history ----------

  // Every visit (container row) of the same container number, newest first,
  // each with its movements in chronological order. Works for departed
  // containers too.
  async history(idOrNo: string): Promise<{ containerNo: string; visits: (Container & { movements: Movement[] })[] }> {
    let containerNo: string;
    if (UUID_RE.test(idOrNo)) {
      const ct = await this.prisma.container.findUnique({ where: { id: idOrNo } });
      if (!ct) throw errors.notFound(`Conteneur ${idOrNo} introuvable.`);
      containerNo = ct.containerNo;
    } else {
      containerNo = normalizeContainerNo(idOrNo);
      if (!CONTAINER_NO_RE.test(containerNo)) throw errors.notFound(`Conteneur ${idOrNo} introuvable.`);
    }
    const visits = await this.prisma.container.findMany({
      where: { containerNo },
      orderBy: { entryDate: 'desc' },
      include: { movements: { orderBy: { createdAt: 'asc' } } },
    });
    if (visits.length === 0) throw errors.notFound(`Conteneur ${containerNo} introuvable.`);
    return { containerNo, visits };
  }

  // ---------- movements ----------

  listMovements(take: number): Promise<(Movement & { container: Container })[]> {
    return this.prisma.movement.findMany({ orderBy: { createdAt: 'desc' }, take, include: { container: true } });
  }
}

function zoneData(z: Zone) {
  return { id: z.id, label: z.label, rows: z.rows, cols: z.cols, version: z.version };
}

function emitReeferConfigured(tx: Tx, ctx: Ctx, ct: ContainerWithReefer): Promise<void> {
  const r = ct.reefer!;
  return emit(
    tx,
    ctx,
    'yard.reefer.configured',
    {
      containerId: ct.id,
      containerNo: ct.containerNo,
      commodity: r.commodity,
      setPoint: r.setPoint,
      tempMin: r.tempMin,
      tempMax: r.tempMax,
      powerStatus: r.powerStatus === 'off' ? 'off' : 'on',
    },
    ct,
  );
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

// Accepts YYYY-MM-DD (midnight UTC) or a full ISO 8601 timestamp, and refuses
// impossible calendar days (2026-02-31) that Date would silently roll over.
function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const m = DATE_RE.exec(value) ?? ISO_RE.exec(value);
  const invalid = () => errors.validation(`Date invalide : ${value} (format attendu AAAA-MM-JJ).`);
  if (!m) throw invalid();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) throw invalid();
  const parsed = DATE_RE.test(value) ? day : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw invalid();
  return parsed;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
