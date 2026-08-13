/**
 * Node-only instrumentation. When RUN_WORKER_IN_WEB is set, boots the background
 * job worker inside the web server process so a single service (or a free-tier
 * host) can both serve requests and process documents. For higher scale, leave
 * the flag off and run the worker as its own service (`npm run worker`).
 *
 * This module is imported only from instrumentation.ts under the nodejs runtime
 * guard, so its node built-ins never reach the Edge bundle.
 */
import { runWorkerLoop } from '@/lib/jobs/worker';
import { logger } from '@/lib/logger';

const enabled =
  process.env.RUN_WORKER_IN_WEB === 'true' || process.env.RUN_WORKER_IN_WEB === '1';

if (enabled) {
  logger.info('worker.in_web_started', { action: 'worker.start', status: 'success' });
  // Fire-and-forget; the loop runs for the lifetime of the process.
  void runWorkerLoop();
}
