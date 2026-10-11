import { createApp } from './app.js';
import { env } from './env.js';
import { startBulkJobWorker } from './lib/doc-store.js';
import { isDemoMode, serviceKeyLooksMisconfigured } from './lib/demo.js';
import { logger } from './lib/logger.js';
import { startSavingsInterestJob } from './lib/savings-interest-job.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 samity-api listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  // The scheduled job posts against Supabase; skip it when running on the
  // in-memory demo store (no real project configured).
  if (env.NODE_ENV !== 'test' && !isDemoMode()) startSavingsInterestJob();
  // Bulk-job queue worker (req 8): drains pending samity/branch jobs.
  if (env.NODE_ENV !== 'test' && isDemoMode()) startBulkJobWorker();
  // The #1 cause of "live pages show no data": the anon key pasted into the
  // service-role slot. RLS then locks every service-client read to zero rows.
  if (!isDemoMode() && serviceKeyLooksMisconfigured()) {
    logger.warn(
      '⚠ SUPABASE_SERVICE_ROLE_KEY decodes to a non-service_role JWT (likely the ANON key). '
        + 'All database reads will return 0 rows. Paste the service_role key from '
        + 'Supabase Dashboard → Project Settings → API keys into root .env and restart.',
    );
  }
});

/** Graceful shutdown for containers and CI. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
  });
}
