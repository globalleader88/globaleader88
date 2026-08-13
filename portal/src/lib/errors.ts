/**
 * Typed application errors. HTTP handlers map these to safe status codes and
 * user-facing messages that never expose internals (stack traces, SQL, secrets).
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'USAGE_LIMIT'
  | 'UPSTREAM'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  USAGE_LIMIT: 402,
  UPSTREAM: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe message returned to the client. */
  readonly publicMessage: string;

  constructor(code: ErrorCode, publicMessage: string, internalMessage?: string) {
    super(internalMessage ?? publicMessage);
    this.code = code;
    this.status = STATUS[code];
    this.publicMessage = publicMessage;
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthenticated: (msg = 'Authentication required') => new AppError('UNAUTHENTICATED', msg),
  forbidden: (msg = 'You do not have access to this resource') => new AppError('FORBIDDEN', msg),
  notFound: (msg = 'Not found') => new AppError('NOT_FOUND', msg),
  validation: (msg = 'Invalid request') => new AppError('VALIDATION', msg),
  conflict: (msg = 'Conflict') => new AppError('CONFLICT', msg),
  rateLimited: (msg = 'Too many requests') => new AppError('RATE_LIMITED', msg),
  usageLimit: (msg = 'Usage limit reached') => new AppError('USAGE_LIMIT', msg),
  upstream: (msg = 'Upstream service error', internal?: string) =>
    new AppError('UPSTREAM', msg, internal),
  internal: (internal?: string) =>
    new AppError('INTERNAL', 'An unexpected error occurred', internal),
};

/** Narrow an unknown thrown value to a safe, client-facing shape. */
export function toPublicError(err: unknown): { code: ErrorCode; status: number; message: string } {
  if (err instanceof AppError) {
    return { code: err.code, status: err.status, message: err.publicMessage };
  }
  return { code: 'INTERNAL', status: 500, message: 'An unexpected error occurred' };
}
