import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { containerTypeSchema } from '@ccis/contracts';
import { actorOf, requireRole, errors } from '@ccis/service-kit';
import type { OperationsService } from './operations-service';
const viewer = { preHandler: requireRole('VIEWER') };
const operator = { preHandler: requireRole('OPERATOR') };
const admin = { preHandler: requireRole('ADMIN') };
const text = z.string().trim().min(1).max(500);
const zoneId = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/);
const uuid = z.string().uuid();
const idSchema = z.object({ id: uuid });
const page = z.coerce.number().int().min(1).max(100000).default(1);
const date = z.string().datetime({ offset: true });
const nullableText = z.string().trim().max(500).nullable();
const taskInput = z.object({ containerId: uuid, kind: z.enum(['MOVE', 'DEPARTURE']), targetZoneId: zoneId.optional(), targetRow: z.number().int().min(0).max(29).optional(), targetCol: z.number().int().min(0).max(39).optional(), priority: z.number().int().min(1).max(3).optional(), dueAt: date.optional(), reason: z.string().max(500).optional() }).refine(v => v.kind !== 'MOVE' || !!v.targetZoneId, { message: 'Zone destination requise.' }).refine(v => (v.targetRow == null) === (v.targetCol == null), { message: 'Rangée et baie doivent être renseignées ensemble.' });
const recordKinds = z.enum(['GATE', 'APPOINTMENT', 'INSPECTION', 'STOCK_CHECK', 'ALERT_ACK', 'IMPORT', 'REORGANIZATION', 'SETTINGS']);
const photo = z.string().max(350000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const recordSchemas = {
  GATE: z.object({ direction: z.enum(['PICKUP', 'DROP_OFF']), truck: text, carrier: text, driver: text, reference: text, seal: z.string().max(100).optional() }),
  APPOINTMENT: z.object({ start: date, end: date, truck: text, carrier: text, direction: z.enum(['PICKUP', 'DROP_OFF']), reference: text }),
  INSPECTION: z.object({ phase: z.enum(['ENTRY', 'EXIT', 'WORKSHOP']), condition: z.enum(['GOOD', 'DAMAGED']), note: text, photos: z.array(photo).max(2).default([]), estimate: z.number().min(0).max(100000000).optional(), currency: z.enum(['MGA', 'EUR', 'USD']).default('MGA'), workOrder: z.string().max(100).optional() }),
  STOCK_CHECK: z.object({ observedContainerNo: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{7}$/).optional(), observedZoneId: zoneId, observedRow: z.number().int().min(0), observedCol: z.number().int().min(0), present: z.boolean(), note: text }),
  ALERT_ACK: z.object({ note: text, category: z.enum(['TEMPERATURE', 'POWER', 'STALE']) }),
};
const importRows = z.array(z.object({ containerNo: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{7}$/), type: containerTypeSchema, zoneId: zoneId, client: z.string().max(200).optional(), weightKg: z.number().int().min(0).max(100000).optional(), plannedExitDate: date.optional() }).strict()).min(1).max(200);
function ctx(req: FastifyRequest) { return { actor: actorOf(req), userEmail: req.identity?.email, correlationId: req.id }; }
export function registerOperationsRoutes(app: FastifyInstance, svc: OperationsService) {
  app.get('/operations/tasks', viewer, req => svc.listTasks(z.object({ scope:z.enum(['active','all','mine']).default('active'),page,take:z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query),ctx(req)));
  app.get('/operations/task-summary', viewer, () => svc.taskSummary());
  app.post('/operations/tasks', operator, req => svc.createTask(taskInput.parse(req.body), ctx(req)));
  app.patch('/operations/tasks/:id', operator, req => svc.updateTask(idSchema.parse(req.params).id, z.object({ expectedVersion: z.number().int().positive(), state: z.enum(['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']), assignee: text.optional(), equipment: text.optional(), reason: text.optional() }).parse(req.body), ctx(req)));
  app.post('/operations/reorganization', operator, req => svc.previewReorganization(z.object({ zoneId: zoneId.optional() }).parse(req.body ?? {}).zoneId, ctx(req)));
  app.post('/operations/reorganization/:id/approve', admin, req => svc.approveReorganization(idSchema.parse(req.params).id, ctx(req)));
  app.patch('/operations/containers/:id/release', admin, req => svc.setRelease(idSchema.parse(req.params).id, z.object({ expectedVersion: z.number().int().positive(), customsStatus: z.enum(['HOLD', 'RELEASED']), clientHoldReason: nullableText, releaseRequired: z.boolean(), releaseReference: nullableText, plannedExitDate: date.nullable().optional() }).parse(req.body), ctx(req)));
  app.get('/operations/policies', viewer, () => svc.policies());
  app.patch('/operations/policies/:id', admin, req => svc.setPolicy(z.object({ id: zoneId }).parse(req.params).id, z.object({ expectedVersion: z.number().int().positive(), maxTier: z.number().int().min(1).max(3), allowedTypes: z.array(containerTypeSchema).max(6), blockedSlots: z.array(z.object({ row: z.number().int().min(0), col: z.number().int().min(0) })).max(1200), maxWeightKg: z.number().int().positive().nullable(), reeferOnly: z.boolean(), reeferPlugs: z.number().int().min(0).nullable() }).parse(req.body), ctx(req)));
  app.get('/operations/journal', viewer, req => svc.journal(z.object({ page, take: z.coerce.number().int().min(1).max(100).default(50), q: z.string().max(100).optional(), type: z.enum(['ARRIVAL','DEPARTURE','TRANSFER','MOVE','COMPACT','CORRECTION']).optional(), zoneId: text.optional(), actor: z.string().max(100).optional(), from: date.optional(), to: date.optional() }).parse(req.query)));
  app.get('/operations/audit', admin, req => svc.auditEvents(z.object({ page }).parse(req.query).page));
  app.get('/operations/records', viewer, req => { const q = z.object({ kind: recordKinds, page }).parse(req.query); return svc.listRecords(q.kind, q.page); });
  app.post('/operations/records', operator, req => {
    const input = z.object({ kind: z.enum(['GATE', 'APPOINTMENT', 'INSPECTION', 'STOCK_CHECK', 'ALERT_ACK']), containerId: uuid.optional(), data: z.unknown() }).parse(req.body);
    if (['INSPECTION','ALERT_ACK'].includes(input.kind) && !input.containerId) throw errors.validation('Conteneur requis.');
    const data = recordSchemas[input.kind].parse(input.data);
    if (input.kind === 'STOCK_CHECK' && !input.containerId && !('observedContainerNo' in data && data.observedContainerNo)) throw errors.validation('Numéro du conteneur observé requis.');
    return svc.createRecord(input.kind, data, input.containerId, ctx(req));
  });
  app.patch('/operations/records/:id', operator, req => svc.updateRecord(idSchema.parse(req.params).id, z.object({ expectedVersion: z.number().int().positive(), status: text, note: text, containerId: uuid.optional() }).parse(req.body), ctx(req)));
  app.post('/operations/records/:id/reconcile', admin, req => { const input = z.object({ expectedVersion: z.number().int().positive(), note: text }).parse(req.body); return svc.reconcile(idSchema.parse(req.params).id, input.expectedVersion, input.note, ctx(req)); });
  app.post('/operations/import/preview', admin, req => svc.previewImport(importRows.parse(z.object({ rows: z.unknown() }).parse(req.body).rows), ctx(req)));
  app.post('/operations/import/:id/apply', admin, req => svc.applyImport(idSchema.parse(req.params).id, ctx(req)));
  app.put('/operations/settings', admin, req => svc.settings(z.object({ gateCapacity: z.number().int().min(1).max(100) }).parse(req.body), ctx(req)));
}
