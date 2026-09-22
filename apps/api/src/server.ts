import { createApp } from './app.js';
import { env } from './env.js';
import { isDemoMode } from './lib/demo.js';
import { logger } from './lib/logger.js';
import { startSavingsInterestJob } from './lib/savings-interest-job.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 samity-api listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  // The scheduled job posts against Supabase; skip it when running on the
  // in-memory demo store (no real project configured).
  if (env.NODE_ENV !== 'test' && !isDemoMode()) startSavingsInterestJob();
});

/** Graceful shutdown for containers and CI. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
  });
}
