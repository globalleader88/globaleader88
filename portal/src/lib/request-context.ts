import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';

/**
 * Extract safe request metadata for audit logs. IP and user-agent are captured
 * where available; a request id is read from the platform header or generated.
 */
export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

export function getRequestMeta(): RequestMeta {
  const h = headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : h.get('x-real-ip');
  return {
    ipAddress: ip,
    userAgent: h.get('user-agent'),
    requestId: h.get('x-request-id') ?? randomUUID(),
  };
}
