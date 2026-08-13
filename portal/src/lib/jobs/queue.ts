import { prisma } from '@/lib/db';
import { env } from '@/env';
import type { JobType, ProcessingJob } from '@prisma/client';

/**
 * Simple, durable, database-backed job queue (no Redis for the MVP). A single
 * job row is claimed atomically with a lock token so concurrent workers never
 * double-process. The `JobQueue` shape is deliberately small so a Celery/RQ/SQS
 * broker can replace it later without touching producers.
 */

export interface EnqueueInput {
  organizationId: string;
  type?: JobType;
  documentId?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueInput): Promise<ProcessingJob> {
  return prisma.processingJob.create({
    data: {
      organizationId: input.organizationId,
      type: input.type ?? 'DOCUMENT_PROCESSING',
      documentId: input.documentId,
      payload: input.payload as object | undefined,
      maxAttempts: input.maxAttempts ?? 3,
    },
  });
}

/**
 * Atomically claim the next runnable job. Uses a conditional update on a
 * freshly-selected candidate; if another worker grabbed it first, the update
 * affects zero rows and we return null so the caller retries.
 */
export async function claimNextJob(workerId = env.JOB_WORKER_ID): Promise<ProcessingJob | null> {
  const now = new Date();
  const candidate = await prisma.processingJob.findFirst({
    where: {
      status: { in: ['QUEUED', 'RETRYING'] },
      runAfter: { lte: now },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return null;

  const result = await prisma.processingJob.updateMany({
    where: { id: candidate.id, status: candidate.status, lockedBy: null },
    data: {
      status: 'RUNNING',
      lockedBy: workerId,
      lockedAt: now,
      startedAt: now,
      attempts: { increment: 1 },
    },
  });
  if (result.count === 0) return null; // lost the race
  return prisma.processingJob.findUnique({ where: { id: candidate.id } });
}

export async function completeJob(jobId: string, metrics?: Record<string, unknown>): Promise<void> {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      finishedAt: new Date(),
      lockedBy: null,
      lastError: null,
      metrics: metrics as object | undefined,
    },
  });
}

/** Fail a job, scheduling a backoff retry until attempts exhaust maxAttempts. */
export async function failJob(jobId: string, error: string): Promise<{ willRetry: boolean }> {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) return { willRetry: false };
  const willRetry = job.attempts < job.maxAttempts;
  const backoffMs = Math.min(60_000, 2 ** job.attempts * 1000);
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: willRetry ? 'RETRYING' : 'FAILED',
      lockedBy: null,
      lockedAt: null,
      lastError: error.slice(0, 1000),
      runAfter: new Date(Date.now() + backoffMs),
      finishedAt: willRetry ? null : new Date(),
    },
  });
  return { willRetry };
}

/** Reclaim jobs whose worker died mid-run (stale lock). */
export async function reclaimStaleJobs(staleMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const result = await prisma.processingJob.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: cutoff } },
    data: { status: 'RETRYING', lockedBy: null, lockedAt: null },
  });
  return result.count;
}
