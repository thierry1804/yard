export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RULE_VIOLATION'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RULE_VIOLATION: 409,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = STATUS[code];
  }
}

export const errors = {
  validation: (m: string) => new AppError('VALIDATION', m),
  unauthorized: (m: string) => new AppError('UNAUTHORIZED', m),
  forbidden: (m: string) => new AppError('FORBIDDEN', m),
  notFound: (m: string) => new AppError('NOT_FOUND', m),
  ruleViolation: (m: string) => new AppError('RULE_VIOLATION', m),
  versionConflict: (m: string) => new AppError('VERSION_CONFLICT', m),
  rateLimited: (m: string) => new AppError('RATE_LIMITED', m),
  serviceUnavailable: (m: string) => new AppError('SERVICE_UNAVAILABLE', m),
};
