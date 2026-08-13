import { runWorkerLoop } from './worker';
import { logger } from '@/lib/logger';

/**
 * Standalone worker entrypoint: `npm run worker` (or the `worker` service in
 * docker-compose). Runs the processing loop until SIGINT/SIGTERM.
 */
async function main(): Promise<void> {
  const controller = new AbortController();
  const shutdown = () => {
    logger.info('worker.shutdown', { action: 'worker.stop', status: 'success' });
    controller.abort();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await runWorkerLoop(controller.signal);
}

main().catch((err) => {
  logger.error('worker.crashed', { action: 'worker.crash', status: 'error' });
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
