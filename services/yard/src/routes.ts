import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { containerTypeSchema } from '@ccis/contracts';
import { actorOf, requireRole } from '@ccis/service-kit';
import { toApiContainer, toApiHistory, toApiMovement, toApiZone } from './mappers';
import { registerOperationsRoutes } from './operations-routes';
import { errors } from '@ccis/service-kit';
import type { Ctx, YardService } from './yard-service';

const version = z.number().int().positive().optional();
// Zone ids are stored uppercase; accept any case and surrounding spaces.
const zoneId = z.string().trim().min(1).transform((s) => s.toUpperCase());
const zoneCreate = z.object({ id: z.string(), label: z.string().optional(), rows: z.number().int(), cols: z.number().int() });
const zoneUpdate = z.object({ label: z.string().optional(), rows: z.number().int().optional(), cols: z.number().int().optional(), expectedVersion: version });
const arrival = z.object({
  containerNo: z.string().optional(),
  type: containerTypeSchema,
  client: z.string().optional(),
  weightKg: z.number().int().nonnegative().max(100_000).optional(),
  zoneId,
  row: z.number().int().optional(),
  col: z.number().int().optional(),
  plannedExitDate: z.string().optional(),
});
const versionOnly = z.object({ expectedVersion: version });
const transfer = z.object({ targetZoneId: zoneId, expectedVersion: version });
const move = z.object({ toZoneId: zoneId, toRow: z.number().int(), toCol: z.number().int(), expectedVersion: version });
const reefer = z.object({
  commodity: z.string().optional(),
  setPoint: z.number().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  currentTemp: z.number().optional(),
  powerStatus: z.enum(['on', 'off']).optional(),
  ventSetting: z.string().optional(),
  humidity: z.string().optional(),
  expectedVersion: version,
});
const containerQuery = z.object({ zoneId: zoneId.optional(), type: containerTypeSchema.optional(), q: z.string().optional() });
const movementsQuery = z.object({ take: z.coerce.number().int().min(1).max(500).default(50), scope: z.enum(['moves', 'operations']).optional() });
const idParam = z.object({ id: z.string() });
const zoneParam = z.object({ id: zoneId });

const viewer = { preHandler: requireRole('VIEWER') };
const operator = { preHandler: requireRole('OPERATOR') };
const admin = { preHandler: requireRole('ADMIN') };

function ctx(req: FastifyRequest): Ctx {
  return { actor: actorOf(req), correlationId: req.id, userEmail: req.identity?.email };
}

export function registerRoutes(app: FastifyInstance, svc: YardService): void {
  registerOperationsRoutes(app, svc.operations);
  // ----- zones -----
  app.get('/zones', viewer, async () => (await svc.listZones()).map(toApiZone));

  app.post('/zones', admin, async (req, reply) => {
    const zone = await svc.createZone(zoneCreate.parse(req.body), ctx(req));
    reply.code(201);
    return toApiZone(zone);
  });

  app.patch('/zones/:id', admin, async (req) => {
    const { id } = zoneParam.parse(req.params);
    return toApiZone(await svc.updateZone(id, zoneUpdate.parse(req.body ?? {}), ctx(req)));
  });

  app.delete('/zones/:id', admin, async (req, reply) => {
    await svc.deleteZone(zoneParam.parse(req.params).id, ctx(req));
    reply.code(204);
  });

  // Static path: Fastify's router prefers it over /zones/:id/compact.
  app.post('/zones/compact-all', operator, async () => { throw errors.ruleViolation('Utilisez une proposition de réorganisation et sa validation dans Opérations.'); });

  app.post('/zones/:id/compact', operator, async () => { throw errors.ruleViolation('Utilisez une proposition de réorganisation et sa validation dans Opérations.'); });

  // ----- containers -----
  app.get('/containers', viewer, async (req) => (await svc.listContainers(containerQuery.parse(req.query))).map(toApiContainer));

  app.get('/containers/:id/history', viewer, async (req) => toApiHistory(await svc.history(idParam.parse(req.params).id)));

  app.get('/containers/:id', viewer, async (req) => toApiContainer(await svc.getContainer(idParam.parse(req.params).id)));

  app.post('/containers/arrival', operator, async (req, reply) => {
    const ct = await svc.arrival(arrival.parse(req.body), ctx(req));
    reply.code(201);
    return toApiContainer(ct);
  });

  app.post('/containers/:id/departure', operator, async (req) =>
    toApiContainer(await svc.departure(idParam.parse(req.params).id, versionOnly.parse(req.body ?? {}), ctx(req))),
  );

  app.post('/containers/:id/transfer', operator, async (req) =>
    toApiContainer(await svc.transfer(idParam.parse(req.params).id, transfer.parse(req.body), ctx(req))),
  );

  app.post('/containers/:id/move', operator, async (req) =>
    toApiContainer(await svc.move(idParam.parse(req.params).id, move.parse(req.body), ctx(req))),
  );

  app.patch('/containers/:id/reefer', operator, async (req) =>
    toApiContainer(await svc.updateReefer(idParam.parse(req.params).id, reefer.parse(req.body ?? {}), ctx(req))),
  );

  // ----- movements -----
  app.get('/movements', viewer, async (req) => {
    const { take, scope } = movementsQuery.parse(req.query);
    return (await svc.listMovements(take, scope)).map(toApiMovement);
  });

  app.post('/movements/:id/undo', operator, async (req) => toApiContainer(await svc.undoMovement(idParam.parse(req.params).id, ctx(req))));
}
