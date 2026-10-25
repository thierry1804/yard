import { z } from 'zod';

export const containerTypeSchema = z.enum(['EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40', 'REEFER', 'REEFER_FULL']);
export type ContainerType = z.infer<typeof containerTypeSchema>;

export const customsStatusSchema = z.enum(['RELEASED', 'HOLD']);

export const positionSchema = z.object({
  zoneId: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  tier: z.number().int().positive(),
});
export type Position = z.infer<typeof positionSchema>;

export const containerSnapshotSchema = z.object({
  id: z.string().min(1),
  containerNo: z.string().min(1),
  type: containerTypeSchema,
  isoCode: z.string(),
  client: z.string().nullable(),
  weightKg: z.number().int().nullable(),
  position: positionSchema,
  entryDate: z.string().datetime(),
  plannedExitDate: z.string().datetime().nullable(),
  customsStatus: customsStatusSchema,
  version: z.number().int().positive(),
});
export type ContainerSnapshot = z.infer<typeof containerSnapshotSchema>;

const zoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  rows: z.number().int(),
  cols: z.number().int(),
  version: z.number().int(),
});

const relocationSchema = z.object({
  container: containerSnapshotSchema,
  from: positionSchema,
  to: positionSchema,
});

export const yardEventSchemas = {
  'yard.container.arrived': z.object({ container: containerSnapshotSchema }),
  'yard.container.departed': z.object({ container: containerSnapshotSchema, from: positionSchema }),
  'yard.container.moved': relocationSchema,
  'yard.container.transferred': relocationSchema,
  'yard.container.relocated': relocationSchema.extend({ reason: z.enum(['COMPACT', 'UNDO']) }),
  'yard.zone.created': z.object({ zone: zoneSchema }),
  'yard.zone.updated': z.object({ zone: zoneSchema }),
  'yard.zone.deleted': z.object({ zoneId: z.string() }),
  'yard.reefer.configured': z.object({
    containerId: z.string(),
    containerNo: z.string(),
    commodity: z.string(),
    setPoint: z.number(),
    tempMin: z.number(),
    tempMax: z.number(),
    powerStatus: z.enum(['on', 'off']),
  }),
} as const;
