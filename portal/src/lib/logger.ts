import { env } from '@/env';

/**
 * Structured JSON logger. In production these lines are shipped to CloudWatch.
 *
 * Redaction is a first-class concern: never log document contents, full
 * prompts, tokens, passwords, PII, or AWS/DB secrets. Callers pass a small,
 * curated context object (requestId, userId, organizationId, action, status).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = new Set([
  'password',
  'devpasswordhash',
  'secret',
  'token',
  'accesstoken',
  'authorization',
  'awssecretaccesskey',
  'aws_secret_access_key',
  'databaseurl',
  'database_url',
  'content',
  'prompt',
  'excerpt',
  'embedding',
  'keyhash',
  'tokenhash',
]);

export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  action?: string;
  status?: string;
  [key: string]: unknown;
}

function redact(ctx: LogContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > 512) {
      out[key] = `${value.slice(0, 128)}…[truncated ${value.length}b]`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: Level, message: string, ctx: LogContext = {}): void {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) return;
  const line = JSON.stringify({
    level,
    msg: message,
    ...redact(ctx),
    // NOTE: timestamp is added by the platform log driver; omitted here so the
    // module stays deterministic and testable.
  });
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  debug: (message: string, ctx?: LogContext) => emit('debug', message, ctx),
  info: (message: string, ctx?: LogContext) => emit('info', message, ctx),
  warn: (message: string, ctx?: LogContext) => emit('warn', message, ctx),
  error: (message: string, ctx?: LogContext) => emit('error', message, ctx),
};
