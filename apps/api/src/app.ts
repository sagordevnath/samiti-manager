import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { isAllowedOrigin } from './env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { membersRouter } from './routes/members.routes.js';
import { membersDemoRouter } from './routes/members.demo.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { navRouter } from './routes/nav.routes.js';
import { orgRouter } from './routes/org.routes.js';
import { samityRouter } from './routes/samity.routes.js';
import { treeRouter } from './routes/tree.routes.js';
import { savingsRouter } from './routes/savings.routes.js';
import { savingsDemoRouter } from './routes/savings.demo.routes.js';
import { loansRouter } from './routes/loans.routes.js';
import { loansDemoRouter } from './routes/loans.demo.routes.js';
import { accountingDemoRouter } from './routes/accounting.demo.routes.js';
import { hrDemoRouter } from './routes/hr.demo.routes.js';
import { workDemoRouter } from './routes/work.demo.routes.js';
import { insWelfareRouter } from './routes/insurance-welfare.routes.js';
import { coopGovRouter } from './routes/coop-governance.routes.js';
import { programsRouter } from './routes/programs.routes.js';
import { misRouter } from './routes/mis.routes.js';
import { misOpsRouter } from './routes/mis-ops.routes.js';
import { commRouter } from './routes/comm.routes.js';
import { commBulkRouter, documentsRouter, publicVerifyRouter } from './routes/documents.routes.js';
import { securityRouter } from './routes/security.routes.js';
import { privacyRouter } from './routes/privacy.routes.js';
import { auditMutationTrail, csrfGuard, sessionTimeoutMiddleware } from './middleware/security.js';
import { collectionDemoRouter } from './routes/collection.demo.routes.js';
import { collectionRouter } from './routes/collection.routes.js';
import { delinquencyRouter } from './routes/delinquency.routes.js';
import { delinquencyRecoveryRouter } from './routes/delinquency-recovery.routes.js';
import { isDemoMode } from './lib/demo.js';
import { accountingRouter } from './routes/accounting.routes.js';
import { hrRouter } from './routes/hr.routes.js';
import { workRouter } from './routes/work.routes.js';
import { delinquencyLiveRouter } from './routes/delinquency-live.routes.js';
import { programsLiveRouter } from './routes/programs-live.routes.js';
import { insWelfareLiveRouter } from './routes/insurance-welfare-live.routes.js';
import { coopGovLiveRouter } from './routes/coop-governance-live.routes.js';
import { misLiveRouter } from './routes/mis-live.routes.js';
import { misOpsLiveRouter } from './routes/mis-ops-live.routes.js';
import { commLiveRouter } from './routes/comms-live.routes.js';
import { commBulkLiveRouter, documentsLiveRouter, publicVerifyLiveRouter } from './routes/documents-live.routes.js';
import { securityLiveRouter } from './routes/security-live.routes.js';
import { privacyLiveRouter } from './routes/privacy-live.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { usersDemoRouter } from './routes/users.demo.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ── Security & platform middleware ────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      // Loopback origins (any port) are same-site outside production, so the
      // Vite dev server works on 5173/5174/5175/… without editing CORS_ORIGINS.
      origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'অনেক বেশি অনুরোধ / Too many requests' } },
    }),
  );

  // ── Security module hardening (req 3) ───────────────────────────────────
  // CSRF: browser-originated mutations must be same-origin + X-Requested-With.
  app.use(csrfGuard(isAllowedOrigin));
  // Idle/absolute session timeout per bearer token (demo mode).
  app.use(sessionTimeoutMiddleware);
  // Append-only audit trail for sensitive mutations (demo-mode analog of the
  // SQL trigger in migration 0056).
  app.use(auditMutationTrail);
  // Tight per-IP budget for the brute-forceable / sensitive endpoints.
  const sensitiveLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'অনেক বেশি চেষ্টা / Too many attempts' } },
  });
  app.use('/api/v1/auth/login', sensitiveLimiter);
  app.use('/api/v1/security/protected-fields/reveal', sensitiveLimiter);
  app.use('/api/v1/security/totp/confirm', sensitiveLimiter);

  // ── Routes (versioned) ────────────────────────────────────────────────────
  app.get('/', (_req, res) => res.json({ name: 'samity-api', status: 'ok' }));
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  // Member module: demo mode serves the in-memory admissions wizard; a
  // configured project gets the Supabase-backed router.
  app.use('/api/v1/members', isDemoMode() ? membersDemoRouter : membersRouter);
  // Dashboard KPIs are served straight from the database in live mode; the
  // web page falls back to list-endpoint counts in demo mode.
  if (!isDemoMode()) app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/samities', samityRouter);
  app.use('/api/v1/nav', navRouter);
  // User accounts & access: demo mode keeps an in-memory directory, a
  // configured project serves users_profile + the Supabase Auth directory.
  app.use('/api/v1/users', isDemoMode() ? usersDemoRouter : usersRouter);
  app.use('/api/v1/org', orgRouter);
  app.use('/api/v1/org', treeRouter);
  // Demo mode (placeholder Supabase env / tests) serves the in-memory store;
  // a configured project gets the real Supabase-backed router.
  app.use('/api/v1/savings', isDemoMode() ? savingsDemoRouter : savingsRouter);
  app.use('/api/v1/loans', isDemoMode() ? loansDemoRouter : loansRouter);
  // Collection: live mode serves the Supabase-backed router (0020/0022/0058);
  // demo mode keeps the in-memory store.
  app.use('/api/v1/collection', isDemoMode() ? collectionDemoRouter : collectionRouter);
  if (isDemoMode()) app.use('/api/v1/delinquency', delinquencyRouter);
  if (isDemoMode()) app.use('/api/v1/delinquency', delinquencyRecoveryRouter);
  // Live mode: Supabase-backed routers for the same surfaces.
  if (!isDemoMode()) app.use('/api/v1/delinquency', delinquencyLiveRouter);
  app.use('/api/v1/accounting', isDemoMode() ? accountingDemoRouter : accountingRouter);
  app.use('/api/v1/hr', isDemoMode() ? hrDemoRouter : hrRouter);
  app.use('/api/v1/work', isDemoMode() ? workDemoRouter : workRouter);
  if (isDemoMode()) app.use('/api/v1/insurance', insWelfareRouter);
  if (isDemoMode()) app.use('/api/v1/coop', coopGovRouter);
  if (isDemoMode()) app.use('/api/v1/programs', programsRouter);
  if (isDemoMode()) app.use('/api/v1/mis', misRouter);
  if (isDemoMode()) app.use('/api/v1/mis-ops', misOpsRouter);
  if (isDemoMode()) app.use('/api/v1/comms', commRouter);
  if (isDemoMode()) app.use('/api/v1/documents', documentsRouter);
  if (isDemoMode()) app.use('/api/v1/security', securityRouter);
  if (isDemoMode()) app.use('/api/v1/privacy', privacyRouter);
  // Live mode: Supabase-backed routers for the same module surfaces.
  if (!isDemoMode()) app.use('/api/v1/insurance', insWelfareLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/coop', coopGovLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/programs', programsLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/mis', misLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/mis-ops', misOpsLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/comms', commLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/documents', documentsLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/security', securityLiveRouter);
  if (!isDemoMode()) app.use('/api/v1/privacy', privacyLiveRouter);
  // Public verification (req 7) — mounted without auth intentionally; live
  // mode verifies against the `documents` table, demo against the in-memory
  // doc store.
  app.use('/api/v1/public', isDemoMode() ? publicVerifyRouter : publicVerifyLiveRouter);
  if (isDemoMode()) app.use('/api/v1/comms/bulk', commBulkRouter);
  // Bulk jobs (comm module) — same worker surface backed by Supabase.
  if (!isDemoMode()) app.use('/api/v1/comms/bulk', commBulkLiveRouter);

  // 404 for unknown API paths.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Central error handler (must be last) ─────────────────────────────────
  app.use(errorHandler);

  return app;
}
