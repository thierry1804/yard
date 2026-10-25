import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'OPERATOR', 'VIEWER']);
export type Role = z.infer<typeof roleSchema>;

export const actorSchema = z.object({ userId: z.string().min(1), role: roleSchema }).nullable();
export type Actor = z.infer<typeof actorSchema>;

export const envelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  version: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  correlationId: z.string().min(1),
  causationId: z.string().nullable(),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().nonnegative(),
  actor: actorSchema,
  data: z.unknown(),
});

export type Envelope<TType extends string = string, TData = unknown> = Omit<
  z.infer<typeof envelopeSchema>,
  'type' | 'data'
> & { type: TType; data: TData };
