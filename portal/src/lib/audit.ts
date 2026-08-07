import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Append-only audit trail. The application never updates or deletes AuditLog
 * rows; there are no code paths that do. Writes are best-effort and must never
 * break the primary action — a failed audit write is logged, not thrown.
 */

export const AuditAction = {
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  SIGNUP: 'auth.signup',
  PASSWORD_RESET: 'auth.password_reset',
  INVITATION_SENT: 'org.invitation_sent',
  INVITATION_ACCEPTED: 'org.invitation_accepted',
  USER_ROLE_CHANGED: 'org.user_role_changed',
  USER_SUSPENDED: 'org.user_suspended',
  ORG_SUSPENDED: 'platform.org_suspended',
  ORG_UNSUSPENDED: 'platform.org_unsuspended',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VIEWED: 'document.viewed',
  DOCUMENT_DOWNLOADED: 'document.downloaded',
  DOCUMENT_DELETED: 'document.deleted',
  DOCUMENT_PROCESSING_STARTED: 'document.processing_started',
  DOCUMENT_PROCESSING_COMPLETED: 'document.processing_completed',
  DOCUMENT_PROCESSING_FAILED: 'document.processing_failed',
  AI_QUERY_SUBMITTED: 'ai.query_submitted',
  AI_RESPONSE_GENERATED: 'ai.response_generated',
  REPORT_GENERATED: 'report.generated',
  RETENTION_POLICY_CHANGED: 'org.retention_policy_changed',
  ORG_SETTING_CHANGED: 'org.setting_changed',
  DATA_EXPORTED: 'org.data_exported',
  ORG_DELETED: 'org.deleted',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditInput {
  action: AuditActionValue;
  organizationId?: string | null;
  userId?: string | null;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure' | 'denied';
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** Non-sensitive metadata only. Never document contents, prompts, or secrets. */
  metadata?: Record<string, string | number | boolean | null>;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        outcome: input.outcome ?? 'success',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch {
    logger.error('audit.write_failed', {
      action: input.action,
      status: 'error',
      organizationId: input.organizationId ?? undefined,
    });
  }
}
