import { claimNextJob, completeJob, failJob, reclaimStaleJobs } from './queue';
import { processDocument, markDocumentFailed } from '@/lib/documents/pipeline';
import { runRetentionSweep } from '@/lib/retention';
import { logger } from '@/lib/logger';

/**
 * Job dispatcher. Claims one job, runs the handler for its type, and records
 * the outcome. Designed to be called in a loop by the worker runner, or once
 * per tick by a serverless scheduler.
 */

export async function processOneJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    switch (job.type) {
      case 'DOCUMENT_PROCESSING': {
        if (!job.documentId) throw new Error('DOCUMENT_PROCESSING job missing documentId');
        const metrics = await processDocument(job.documentId);
        await completeJob(job.id, metrics as unknown as Record<string, unknown>);
        break;
      }
      case 'RETENTION_SWEEP': {
        const result = await runRetentionSweep();
        await completeJob(job.id, result);
        break;
      }
      default:
        await completeJob(job.id, { skipped: true });
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown processing error';
    const { willRetry } = await failJob(job.id, message);
    if (!willRetry && job.type === 'DOCUMENT_PROCESSING' && job.documentId) {
      await markDocumentFailed(job.documentId, message);
    }
    logger.error('job.failed', {
      action: 'job.failed',
      status: willRetry ? 'retrying' : 'failed',
      organizationId: job.organizationId,
      resourceId: job.id,
    });
    return true;
  }
}

/** Continuous worker loop with idle backoff. */
export async function runWorkerLoop(signal?: AbortSignal): Promise<void> {
  logger.info('worker.started', { action: 'worker.start', status: 'success' });
  let sinceReclaim = 0;
  while (!signal?.aborted) {
    if (sinceReclaim++ % 20 === 0) await reclaimStaleJobs();
    const didWork = await processOneJob();
    if (!didWork) await sleep(1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
