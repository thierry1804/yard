import { errors } from '@ccis/service-kit';
import { Prisma, type PrismaClient, type WorkTask } from './generated/prisma';
import type { Ctx, YardService, ArrivalInput } from './yard-service';
import { lockZones } from './locks';
import { placementError, isReefer } from './domain/rules';
import { emit } from './events';
import { storageError, assertRelease } from './storage-policy';

type Tx = Prisma.TransactionClient;
type Json = Prisma.InputJsonValue;
export interface TaskInput { containerId: string; kind: 'MOVE' | 'DEPARTURE'; targetZoneId?: string; targetRow?: number; targetCol?: number; priority?: number; dueAt?: string; reason?: string }
const active = ['REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'];
const actor = (ctx: Ctx) => ctx.userEmail || ctx.actor?.userId || 'system';

export class OperationsService {
  constructor(private db: PrismaClient, private yard: YardService, private committed: () => void) {}
  private async tx<T>(fn: (tx: Tx) => Promise<T>) { const result = await this.db.$transaction(fn, { maxWait: 3000, timeout: 10000 }); this.committed(); return result; }
  private async audit(tx: Tx, kind: string, entityId: string, action: string, data: unknown, ctx: Ctx) {
    const event = await tx.auditEvent.create({ data: { kind, entityId, action, actor: actor(ctx), data: JSON.parse(JSON.stringify(data)) as Json } });
    await emit(tx, ctx, 'yard.operations.changed', { kind, entityId, action }, { id: event.id, version: 1 });
    return event;
  }
  listTasks(query: {scope?: 'active'|'all'|'mine';page?:number;take?:number} = {}, ctx?: Ctx) {
    const where: Prisma.WorkTaskWhereInput = query.scope === 'all' ? {} : { state: { in: active } };
    if (query.scope === 'mine') where.assignee = { in: [ctx?.actor?.userId, ctx?.userEmail].filter((x): x is string => !!x) };
    return this.db.workTask.findMany({ where, include: { container: true }, orderBy: query.scope === 'all' ? [{ createdAt:'desc' }, {id:'desc'}] : [{priority:'asc'},{createdAt:'asc'},{id:'asc'}], skip:((query.page??1)-1)*(query.take??50), take:query.take??50 });
  }
  async taskSummary() {
    const since = new Date(Date.now()-86400000);
    const [activeCount, overdueCount, completedCount, equipment] = await this.db.$transaction([
      this.db.workTask.count({where:{state:{in:active}}}),
      this.db.workTask.count({where:{state:{in:active},dueAt:{lt:new Date()}}}),
      this.db.workTask.count({where:{state:'COMPLETED',updatedAt:{gte:since}}}),
      this.db.workTask.groupBy({by:['equipment'],orderBy:{equipment:'asc'},where:{state:'COMPLETED',updatedAt:{gte:since}},_count:{id:true}}),
    ]);
    const visits = await this.db.operationRecord.findMany({where:{kind:'GATE',status:'EXITED',updatedAt:{gte:since}}});
    const durations = visits.map(v=>{ const d=v.data as {lastActionAt?:string};return d.lastActionAt?(new Date(d.lastActionAt).getTime()-v.createdAt.getTime())/60000:NaN; }).filter(n=>Number.isFinite(n)&&n>=0);
    return {activeCount,overdueCount,completedCount,equipment,truckTurnMinutes:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,truckSampleCount:durations.length};
  }
  async createTask(input: TaskInput, ctx: Ctx) {
    return this.tx(async tx => {
      const ct = await tx.container.findUnique({ where: { id: input.containerId } });
      if (!ct || ct.status !== 'PRESENT') throw errors.notFound('Conteneur absent du parc.');
      await lockZones(tx, [{ zoneId: ct.zoneId, mode: 'exclusive' }, ...(input.targetZoneId ? [{ zoneId: input.targetZoneId, mode: 'exclusive' as const }] : [])]);
      const current = await tx.container.findUniqueOrThrow({ where: { id: ct.id } });
      if (current.version !== ct.version) throw errors.versionConflict('Position modifiée, rechargez.');
      if (await tx.workTask.findFirst({ where: { containerId: ct.id, state: { in: active } } })) throw errors.ruleViolation('Une tâche active existe déjà pour ce conteneur.');
      let targetRow = input.targetRow; let targetCol = input.targetCol;
      if (input.kind === 'MOVE') {
        const z = await tx.zone.findUnique({ where: { id: input.targetZoneId } });
        if (!z) throw errors.notFound('Zone destination introuvable.');
        const cts = await tx.container.findMany({ where: { zoneId: z.id, status: 'PRESENT' } });
        const valid = (r: number, c: number) => {
          const stack = cts.filter(x => x.row === r && x.col === c && x.id !== ct.id);
          return !(ct.zoneId === z.id && ct.row === r && ct.col === c) && !storageError(z, r, c, ct.type, stack, ct.weightKg) && !placementError(stack, ct.type);
        };
        if (targetRow == null || targetCol == null) {
          let found = false;
          for (let r = 0; r < z.rows && !found; r++) for (let c = 0; c < z.cols && !found; c++) if (valid(r, c)) { targetRow = r; targetCol = c; found = true; }
          if (!found) throw errors.ruleViolation('Aucune destination compatible.');
        } else if (!valid(targetRow, targetCol)) throw errors.ruleViolation('Destination incompatible.');
      }
      const task = await tx.workTask.create({ data: { containerId: ct.id, kind: input.kind, priority: input.priority ?? 2, reason: input.reason, dueAt: input.dueAt ? new Date(input.dueAt) : null,
        sourceVersion: ct.version, sourceZoneId: ct.zoneId, sourceRow: ct.row, sourceCol: ct.col, sourceTier: ct.tier,
        targetZoneId: input.targetZoneId, targetRow, targetCol } });
      await this.audit(tx, 'TASK', task.id, 'REQUESTED', task, ctx); return task;
    });
  }
  async updateTask(id: string, input: { expectedVersion: number; state: string; assignee?: string; equipment?: string; reason?: string }, ctx: Ctx) {
    return this.tx(async tx => {
      await tx.$queryRaw`SELECT id FROM "WorkTask" WHERE id = ${id}::uuid FOR UPDATE`;
      const task = await tx.workTask.findUnique({ where: { id } });
      if (!task) throw errors.notFound('Tâche introuvable.');
      if (task.version !== input.expectedVersion) throw errors.versionConflict('Tâche modifiée, rechargez.');
      const transitions: Record<string, string[]> = { REQUESTED: ['ASSIGNED', 'CANCELLED'], ASSIGNED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'BLOCKED', 'CANCELLED'], BLOCKED: ['ASSIGNED', 'CANCELLED'] };
      if (!transitions[task.state]?.includes(input.state)) throw errors.ruleViolation('Transition de tâche interdite.');
      if (ctx.actor?.role !== 'ADMIN' && task.assignee && task.assignee !== actor(ctx) && task.assignee !== ctx.actor?.userId) throw errors.forbidden('Tâche affectée à un autre opérateur.');
      if (input.assignee && input.assignee !== actor(ctx) && input.assignee !== ctx.actor?.userId && ctx.actor?.role !== 'ADMIN') throw errors.forbidden('Seul un administrateur peut affecter un autre opérateur.');
      if (input.state === 'ASSIGNED' && !(input.assignee || task.assignee)) throw errors.validation('Opérateur requis.');
      if (['BLOCKED', 'CANCELLED'].includes(input.state) && !input.reason?.trim()) throw errors.validation('Motif requis.');
      if (input.state === 'COMPLETED') {
        if (task.groupId) {
          const group = await tx.operationRecord.findUniqueOrThrow({ where: { id: task.groupId } });
          const steps = (group.data as { steps: { containerId: string }[] }).steps;
          const previous = steps.slice(0, steps.findIndex(s => s.containerId === task.containerId)).map(s => s.containerId);
          if (await tx.workTask.count({ where: { groupId: task.groupId, containerId: { in: previous }, state: { not: 'COMPLETED' } } })) throw errors.ruleViolation('Confirmez les étapes précédentes du plan avant celle-ci.');
        }
        if (task.kind === 'DEPARTURE') await this.yard.departureInTx(tx, task.containerId, { expectedVersion: task.sourceVersion }, ctx);
        else await this.yard.moveInTx(tx, task.containerId, { toZoneId: task.targetZoneId!, toRow: task.targetRow!, toCol: task.targetCol!, expectedVersion: task.sourceVersion }, ctx);
      }
      const updated = await tx.workTask.update({ where: { id }, data: { state: input.state, assignee: input.assignee ?? task.assignee, equipment: input.equipment ?? task.equipment, reason: input.reason ?? task.reason, version: { increment: 1 } } });
      await this.audit(tx, 'TASK', id, input.state, { before: task, after: updated }, ctx); return updated;
    });
  }
  async previewReorganization(zoneId: string | undefined, ctx: Ctx) {
    return this.tx(async tx => {
      const zones = await tx.zone.findMany({ where: zoneId ? { id: zoneId } : {}, orderBy: { id: 'asc' } });
      if (!zones.length) throw errors.notFound('Zone introuvable.');
      await lockZones(tx, zones.map(z => ({ zoneId: z.id, mode: 'exclusive' as const })));
      const cts = await tx.container.findMany({ where: { zoneId: { in: zones.map(z => z.id) }, status: 'PRESENT' } });
      const simulation = cts.map(c => ({ ...c }));
      const steps: { containerId: string; containerNo: string; sourceVersion: number; fromZoneId: string; fromRow: number; fromCol: number; fromTier: number; targetZoneId: string; targetRow: number; targetCol: number; targetTier: number }[] = [];
      for (const z of zones) {
        for (let r = 0; r < z.rows; r++) for (let c = 0; c < z.cols; c++) {
          for (;;) {
            const stack = simulation.filter(x => x.zoneId === z.id && x.row === r && x.col === c).sort((a,b) => a.tier-b.tier);
            if (stack.length >= z.maxTier) break;
            const candidates = simulation.filter(x => x.zoneId === z.id && x.row * z.cols + x.col > r * z.cols + c
              && !simulation.some(other => other.zoneId === x.zoneId && other.row === x.row && other.col === x.col && other.tier > x.tier)
              && !steps.some(s => s.containerId === x.id)
              && !storageError(z, r, c, x.type, stack, x.weightKg) && !placementError(stack, x.type)
              && !(stack.length && x.plannedExitDate && stack.some(s => s.plannedExitDate && s.plannedExitDate < x.plannedExitDate!)));
            // Prefer the earliest due departure at the top, then the furthest occupied slot.
            candidates.sort((a,b) => (a.plannedExitDate?.getTime() ?? Infinity) - (b.plannedExitDate?.getTime() ?? Infinity) || (b.row*z.cols+b.col)-(a.row*z.cols+a.col));
            const ct = candidates[0]; if (!ct) break;
            steps.push({ containerId: ct.id, containerNo: ct.containerNo, sourceVersion: ct.version, fromZoneId: ct.zoneId, fromRow: ct.row, fromCol: ct.col, fromTier: ct.tier, targetZoneId: z.id, targetRow: r, targetCol: c, targetTier: stack.length+1 });
            ct.row = r; ct.col = c; ct.tier = stack.length+1;
          }
        }
      }
      const snapshot = cts.map(c => ({ id: c.id, version: c.version }));
      const data = { steps, snapshot, zones: zones.map(z => ({ id: z.id, version: z.version })), scope: zoneId ?? 'all' };
      const record = await tx.operationRecord.create({ data: { kind: 'REORGANIZATION', status: 'PROPOSED', data, createdBy: actor(ctx) } });
      await this.audit(tx, record.kind, record.id, 'PROPOSED', data, ctx); return record;
    });
  }
  async approveReorganization(id: string, ctx: Ctx) {
    return this.tx(async tx => {
      await tx.$queryRaw`SELECT id FROM "OperationRecord" WHERE id = ${id}::uuid FOR UPDATE`;
      const record = await tx.operationRecord.findUnique({ where: { id } });
      if (!record || record.kind !== 'REORGANIZATION') throw errors.notFound('Plan introuvable.');
      if (record.status !== 'PROPOSED') throw errors.ruleViolation('Plan déjà traité.');
      const data = record.data as { steps: { containerId: string; sourceVersion: number; fromZoneId: string; fromRow: number; fromCol: number; fromTier: number; targetZoneId: string; targetRow: number; targetCol: number }[]; snapshot: { id: string; version: number }[]; zones: { id: string; version: number }[] };
      await lockZones(tx, data.zones.map(z => ({ zoneId: z.id, mode: 'exclusive' as const })));
      const current = await tx.container.findMany({ where: { status: 'PRESENT', zoneId: { in: data.zones.map(z => z.id) } } });
      if (current.length !== data.snapshot.length || current.some(c => !data.snapshot.some(s => s.id === c.id && s.version === c.version))) throw errors.versionConflict('Le parc a changé. Recalculez la proposition.');
      for (const z of data.zones) if ((await tx.zone.findUnique({ where: { id: z.id } }))?.version !== z.version) throw errors.versionConflict('Configuration de zone modifiée.');
      if (await tx.workTask.count({ where: { containerId: { in: data.steps.map(s => s.containerId) }, state: { in: active } } })) throw errors.ruleViolation('Des conteneurs du plan ont déjà une tâche active.');
      for (const s of data.steps) await tx.workTask.create({ data: { containerId: s.containerId, kind: 'MOVE', groupId: id, sourceVersion: s.sourceVersion, sourceZoneId: s.fromZoneId, sourceRow: s.fromRow, sourceCol: s.fromCol, sourceTier: s.fromTier, targetZoneId: s.targetZoneId, targetRow: s.targetRow, targetCol: s.targetCol, reason: 'Réorganisation validée' } });
      const updated = await tx.operationRecord.update({ where: { id }, data: { status: 'APPROVED', version: { increment: 1 } } });
      await this.audit(tx, 'REORGANIZATION', id, 'APPROVED', { taskCount: data.steps.length }, ctx); return updated;
    });
  }
  async setRelease(id: string, input: { expectedVersion: number; customsStatus: 'HOLD' | 'RELEASED'; clientHoldReason: string | null; releaseRequired: boolean; releaseReference: string | null; plannedExitDate?: string | null }, ctx: Ctx) {
    return this.tx(async tx => {
      const ct = await tx.container.findUnique({ where: { id } }); if (!ct) throw errors.notFound('Conteneur introuvable.');
      await lockZones(tx, [{ zoneId: ct.zoneId, mode: 'exclusive' }]);
      const { expectedVersion, plannedExitDate, ...fields } = input;
      const result = await tx.container.updateMany({ where: { id, version: expectedVersion, status: 'PRESENT' }, data: { ...fields, ...(plannedExitDate !== undefined ? { plannedExitDate: plannedExitDate ? new Date(plannedExitDate) : null } : {}), version: { increment: 1 } } });
      if (!result.count) throw errors.versionConflict('Conteneur modifié, rechargez.');
      await this.audit(tx, 'RELEASE', id, 'UPDATED', { before: ct, after: input }, ctx); return tx.container.findUniqueOrThrow({ where: { id }, include: { reefer: true } });
    });
  }
  async setPolicy(id: string, data: { expectedVersion: number; maxTier: number; allowedTypes: string[]; blockedSlots: { row: number; col: number }[]; maxWeightKg: number | null; reeferOnly: boolean; reeferPlugs: number | null }, ctx: Ctx) {
    return this.tx(async tx => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      const z = await tx.zone.findUnique({ where: { id } }); if (!z) throw errors.notFound('Zone introuvable.');
      if (z.version !== data.expectedVersion) throw errors.versionConflict('Zone modifiée.');
      const { expectedVersion, ...policy } = data;
      const next = { ...z, ...policy };
      const cts = await tx.container.findMany({ where: { zoneId: id, status: 'PRESENT' } });
      if (new Set(data.blockedSlots.map(s => `${s.row}:${s.col}`)).size !== data.blockedSlots.length) throw errors.validation('Emplacements condamnés dupliqués.');
      if (data.blockedSlots.some(s => s.row >= z.rows || s.col >= z.cols)) throw errors.validation('Emplacement condamné hors zone.');
      for (const c of cts) {
        const error = storageError(next, c.row, c.col, c.type, [], c.weightKg);
        if (error || c.tier > next.maxTier) throw errors.ruleViolation('Configuration incompatible avec le stock présent.');
      }
      if (policy.reeferPlugs != null && cts.filter(c => isReefer(c.type)).length > policy.reeferPlugs) throw errors.ruleViolation('Prises insuffisantes pour le stock présent.');
      const updated = await tx.zone.update({ where: { id }, data: { ...policy, version: { increment: 1 } } });
      await this.audit(tx, 'ZONE_POLICY', id, 'UPDATED', { before: z, after: updated }, ctx);
      await emit(tx, ctx, 'yard.zone.updated', { zone: { id, label: updated.label, rows: updated.rows, cols: updated.cols, version: updated.version } }, updated); return updated;
    });
  }
  listRecords(kind: string, page: number) { return this.db.operationRecord.findMany({ where: { kind }, include: { container: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page-1)*50, take: 50 }); }
  async createRecord(kind: string, data: Record<string, unknown>, containerId: string | undefined, ctx: Ctx) {
    return this.tx(async tx => {
      if (containerId && !await tx.container.findUnique({ where: { id: containerId } })) throw errors.notFound('Conteneur introuvable.');
      if (kind === 'APPOINTMENT') {
        const start = new Date(data.start as string); const end = new Date(data.end as string);
        if (start >= end) throw errors.validation('Le créneau doit avoir une fin après son début.');
        // Serialize capacity checks for overlapping appointments.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(2000000000, 1)`;
        const scheduled = await tx.operationRecord.findMany({ where: { kind, status: { not: 'CANCELLED' } } });
        const overlapping = scheduled.filter(r => { const d = r.data as { start: string; end: string }; return new Date(d.start) < end && new Date(d.end) > start; });
        const config = await tx.operationRecord.findFirst({ where: { kind: 'SETTINGS' }, orderBy: { createdAt: 'desc' } });
        const capacity = (config?.data as { gateCapacity?: number } | undefined)?.gateCapacity ?? 4;
        if (overlapping.length >= capacity) throw errors.ruleViolation('Capacité du créneau atteinte.');
      }
      if (kind === 'STOCK_CHECK') {
        const ct = containerId ? await tx.container.findUnique({ where: { id: containerId } }) : null;
        data = { ...data, expected: ct ? { zoneId: ct.zoneId, row: ct.row, col: ct.col, tier: ct.tier, version: ct.version } : null };
      }
      if (kind === 'ALERT_ACK') {
        const ct = await tx.container.findUnique({ where: { id: containerId }, include: { reefer: true } });
        if (!ct?.reefer) throw errors.validation('Reefer requis.');
        if ((data.category === 'TEMPERATURE' && !ct.reefer.alert) || (data.category === 'POWER' && ct.reefer.powerStatus !== 'off') || (data.category === 'STALE' && Date.now() - ct.reefer.lastReadingAt.getTime() <= 3600000)) throw errors.ruleViolation('Cette condition d’alerte n’est plus active.');
        data = { ...data, readingAt: ct.reefer.lastReadingAt.toISOString(), alert: ct.reefer.alert, powerStatus: ct.reefer.powerStatus };
      }
      const status = kind === 'GATE' ? 'ARRIVED' : kind === 'APPOINTMENT' ? 'SCHEDULED' : kind === 'STOCK_CHECK' ? 'OPEN' : kind === 'ALERT_ACK' ? 'ACKNOWLEDGED' : kind === 'INSPECTION' ? 'OPEN' : 'RECORDED';
      const record = await tx.operationRecord.create({ data: { kind, status, containerId, data: data as Json, createdBy: actor(ctx) } });
      await this.audit(tx, kind, record.id, status, data, ctx); return record;
    });
  }
  async updateRecord(id: string, input: { expectedVersion: number; status: string; note: string; containerId?: string }, ctx: Ctx) {
    return this.tx(async tx => {
      await tx.$queryRaw`SELECT id FROM "OperationRecord" WHERE id = ${id}::uuid FOR UPDATE`;
      const record = await tx.operationRecord.findUnique({ where: { id } }); if (!record) throw errors.notFound('Enregistrement introuvable.');
      if (record.version !== input.expectedVersion) throw errors.versionConflict('Enregistrement modifié.');
      const allowed: Record<string, Record<string, string[]>> = {
        GATE: { ARRIVED: ['CHECKED', 'BLOCKED'], BLOCKED: ['CHECKED'], CHECKED: ['EXITED', 'BLOCKED'] },
        APPOINTMENT: { SCHEDULED: ['ARRIVED', 'CANCELLED'], ARRIVED: ['COMPLETED', 'CANCELLED'] },
        INSPECTION: { OPEN: ['ESTIMATED', 'CLOSED'], ESTIMATED: ['AUTHORIZED', 'REJECTED'], AUTHORIZED: ['REPAIRED'], REPAIRED: ['CLOSED'] },
        STOCK_CHECK: { OPEN: ['VERIFIED', 'DISCREPANCY'], DISCREPANCY: ['RESOLVED'] },
        ALERT_ACK: { ACKNOWLEDGED: ['RESOLVED'] },
      };
      if (!allowed[record.kind]?.[record.status]?.includes(input.status)) throw errors.ruleViolation('Transition interdite.');
      if (!input.note.trim()) throw errors.validation('Compte rendu requis.');
      if ((record.kind === 'INSPECTION' && input.status === 'AUTHORIZED') || (record.kind === 'STOCK_CHECK' && input.status === 'RESOLVED')) {
        if (ctx.actor?.role !== 'ADMIN') throw errors.forbidden('Validation du superviseur requise.');
      }
      const containerId = input.containerId ?? record.containerId;
      if (input.containerId && record.kind !== 'GATE') throw errors.validation('Liaison de conteneur réservée aux passages camion.');
      if (record.kind === 'GATE' && ['CHECKED', 'EXITED'].includes(input.status)) {
        const d = record.data as { direction: string };
        if (!containerId && (d.direction === 'PICKUP' || input.status === 'EXITED')) throw errors.ruleViolation('Identifiez le conteneur avant de poursuivre le passage camion.');
        const ct = containerId ? await tx.container.findUnique({ where: { id: containerId } }) : null;
        if (containerId && !ct) throw errors.notFound('Conteneur introuvable.');
        if (ct && d.direction === 'PICKUP' && input.status === 'CHECKED') assertRelease(ct);
        if (ct && d.direction === 'PICKUP' && input.status === 'EXITED' && ct.status !== 'DEPARTED') throw errors.ruleViolation('Confirmez la tâche de sortie du conteneur avant la sortie camion.');
        if (ct && d.direction === 'DROP_OFF' && input.status === 'EXITED' && ct.status !== 'PRESENT') throw errors.ruleViolation('Confirmez l’arrivée du conteneur avant la sortie camion.');
      }
      const data = { ...(record.data as Record<string, Json>), lastNote: input.note, lastActionAt: new Date().toISOString() };
      const updated = await tx.operationRecord.update({ where: { id }, data: { status: input.status, containerId, data, version: { increment: 1 } } });
      await this.audit(tx, record.kind, id, input.status, { before: record, after: updated }, ctx); return updated;
    });
  }
  async reconcile(id: string, expectedVersion: number, note: string, ctx: Ctx) {
    return this.tx(async tx => {
      await tx.$queryRaw`SELECT id FROM "OperationRecord" WHERE id = ${id}::uuid FOR UPDATE`;
      const record = await tx.operationRecord.findUnique({ where: { id } });
      if (!record || record.kind !== 'STOCK_CHECK' || record.status !== 'DISCREPANCY' || !record.containerId) throw errors.ruleViolation('Écart lié à un conteneur existant requis.');
      if (record.version !== expectedVersion) throw errors.versionConflict('Contrôle modifié.');
      const d = record.data as { present: boolean; observedZoneId: string; observedRow: number; observedCol: number; expected: { version: number } };
      if (!d.present) throw errors.ruleViolation('Un conteneur absent nécessite une investigation, pas un déplacement automatique.');
      await this.yard.moveInTx(tx, record.containerId, { toZoneId: d.observedZoneId, toRow: d.observedRow, toCol: d.observedCol, expectedVersion: d.expected.version }, ctx, true);
      const updated = await tx.operationRecord.update({ where: { id }, data: { status: 'RESOLVED', data: { ...(record.data as Record<string, Json>), lastNote: note, lastActionAt: new Date().toISOString() }, version: { increment: 1 } } });
      await this.audit(tx, 'STOCK_CHECK', id, 'POSITION_CORRECTED', { before: record, after: updated }, ctx); return updated;
    });
  }
  async journal(query: { page: number; take: number; q?: string; type?: string; zoneId?: string; actor?: string; from?: string; to?: string }) {
    const where: Prisma.MovementWhereInput = {
      ...(query.q ? { container: { containerNo: { contains: query.q.toUpperCase() } } } : {}),
      ...(query.type ? { type: query.type as Prisma.EnumMovementTypeFilter['equals'] } : {}),
      ...(query.zoneId ? { OR: [{ fromZoneId: query.zoneId }, { toZoneId: query.zoneId }] } : {}),
      ...(query.actor ? { userEmail: { contains: query.actor, mode: 'insensitive' } } : {}),
      ...((query.from || query.to) ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    const [items, total] = await this.db.$transaction([this.db.movement.findMany({ where, include: { container: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page-1)*query.take, take: query.take }), this.db.movement.count({ where })]);
    return { items, total, page: query.page, take: query.take };
  }
  async auditEvents(page: number) { const [items,total] = await this.db.$transaction([this.db.auditEvent.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page-1)*50, take:50 }), this.db.auditEvent.count()]); return { items,total }; }
  async previewImport(rows: ArrivalInput[], ctx: Ctx) {
    const errorsList: string[] = [];
    const seen = new Set<string>();
    const zones = await this.db.zone.findMany();
    for (const [i,row] of rows.entries()) {
      if (seen.has(row.containerNo!)) errorsList.push(`Ligne ${i+1} : numéro dupliqué.`);
      seen.add(row.containerNo!);
      if (!zones.some(z => z.id === row.zoneId)) errorsList.push(`Ligne ${i+1} : zone inconnue.`);
      if (await this.db.container.findFirst({ where: { containerNo: row.containerNo, status: 'PRESENT' } })) errorsList.push(`Ligne ${i+1} : conteneur déjà présent.`);
    }
    return this.tx(async tx => {
      const record = await tx.operationRecord.create({ data: { kind: 'IMPORT', status: errorsList.length ? 'INVALID' : 'VALIDATED', data: JSON.parse(JSON.stringify({ rows, errors: errorsList, source: 'Fichier interne' })) as Json, createdBy: actor(ctx) } });
      await this.audit(tx, 'IMPORT', record.id, record.status, { count: rows.length, errors: errorsList }, ctx); return record;
    });
  }
  async applyImport(id: string, ctx: Ctx) {
    try {
      return await this.tx(async tx => {
        await tx.$queryRaw`SELECT id FROM "OperationRecord" WHERE id = ${id}::uuid FOR UPDATE`;
        const record = await tx.operationRecord.findUnique({ where: { id } });
        if (!record || record.kind !== 'IMPORT') throw errors.notFound('Import introuvable.');
        if (record.status !== 'VALIDATED') throw errors.ruleViolation('Import non valide ou déjà appliqué.');
        const rows = (record.data as unknown as { rows: ArrivalInput[] }).rows;
        await lockZones(tx, [...new Set(rows.map(r => r.zoneId))].map(zoneId => ({ zoneId, mode: 'exclusive' as const })));
        for (const row of rows) await this.yard.arrivalInTx(tx, row, ctx);
        const updated = await tx.operationRecord.update({ where: { id }, data: { status: 'APPLIED', version: { increment: 1 } } });
        await this.audit(tx, 'IMPORT', id, 'APPLIED', { count: rows.length }, ctx); return updated;
      });
    } catch (e) {
      await this.db.auditEvent.create({ data: { kind: 'IMPORT', entityId: id, action: 'FAILED', actor: actor(ctx), data: { error: e instanceof Error ? e.message : 'Erreur import' } } });
      throw e;
    }
  }
  settings(data: { gateCapacity: number }, ctx: Ctx) { return this.tx(async tx => {
    const record = await tx.operationRecord.create({ data: { kind: 'SETTINGS', status: 'ACTIVE', data, createdBy: actor(ctx) } });
    await this.audit(tx, 'SETTINGS', record.id, 'UPDATED', data, ctx); return record;
  }); }
  policies() { return this.db.zone.findMany({ orderBy: { id: 'asc' } }); }
}
