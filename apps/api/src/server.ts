import { createApp } from './app.js';
import { env } from './env.js';
import { startBulkJobWorker } from './lib/doc-store.js';
import { isDemoMode, serviceKeyLooksMisconfigured, supabaseLooksUnconfigured } from './lib/demo.js';
import { logger } from './lib/logger.js';
import { startSavingsInterestJob } from './lib/savings-interest-job.js';

/**
 * Fail fast instead of pretending: DEMO_MODE=off means "this deployment must
 * serve real data", so booting with placeholder credentials would be worse than
 * not booting at all (every read would 401 and look like an empty database).
 */
if (env.DEMO_MODE === 'off' && supabaseLooksUnconfigured()) {
  logger.fatal(
    'DEMO_MODE=off but the Supabase credentials are still placeholders. ' +
      'Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service_role, not anon), ' +
      'or use DEMO_MODE=force to serve the in-memory demo store deliberately.',
  );
  process.exit(1);
}

const app = createApp();
const demo = isDemoMode();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 samity-api listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  logger.info(
    demo
      ? '🧪 Data mode: DEMO (in-memory sample store — no Supabase reads or writes)'
      : '🗄️  Data mode: LIVE (Supabase project configured)',
  );
  logger.info(`🌐 CORS_ORIGINS: ${env.CORS_ORIGINS.join(', ') || '(none)'}`);
  // The scheduled job posts against Supabase; skip it on the in-memory store.
  if (env.NODE_ENV !== 'test' && !demo) startSavingsInterestJob();
  // Bulk-job queue worker (req 8): drains pending samity/branch jobs.
  if (env.NODE_ENV !== 'test' && demo) startBulkJobWorker();
  // The #1 cause of "live pages show no data": the anon key pasted into the
  // service-role slot. RLS then locks every service-client read to zero rows.
  if (!demo && serviceKeyLooksMisconfigured()) {
    logger.warn(
      '⚠ SUPABASE_SERVICE_ROLE_KEY decodes to a non-service_role JWT (likely the ANON key). '
        + 'All database reads will return 0 rows. Paste the service_role key from '
        + 'Supabase Dashboard → Project Settings → API keys into the API environment and restart.',
    );
  }
  // The #2 cause: the deployed web bundle has no API address to call.
  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.every((o) => /localhost|127\.0\.0\.1/.test(o))) {
    logger.warn(
      '⚠ CORS_ORIGINS only lists loopback origins. A deployed browser app will be blocked with a '
        + 'CORS error. Set CORS_ORIGINS to the deployed web origin, e.g. https://your-site.netlify.app',
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
