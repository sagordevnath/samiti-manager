import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { membersRouter } from './routes/members.routes.js';
import { membersDemoRouter } from './routes/members.demo.routes.js';
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
import { delinquencyRouter } from './routes/delinquency.routes.js';
import { delinquencyRecoveryRouter } from './routes/delinquency-recovery.routes.js';
import { isDemoMode } from './lib/demo.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ── Security & platform middleware ────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
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
  app.use(csrfGuard(env.CORS_ORIGINS));
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
  app.use('/api/v1/samities', samityRouter);
  app.use('/api/v1/nav', navRouter);
  app.use('/api/v1/org', orgRouter);
  app.use('/api/v1/org', treeRouter);
  // Demo mode (placeholder Supabase env / tests) serves the in-memory store;
  // a configured project gets the real Supabase-backed router.
  app.use('/api/v1/savings', isDemoMode() ? savingsDemoRouter : savingsRouter);
  app.use('/api/v1/loans', isDemoMode() ? loansDemoRouter : loansRouter);
  if (isDemoMode()) app.use('/api/v1/collection', collectionDemoRouter);
  if (isDemoMode()) app.use('/api/v1/delinquency', delinquencyRouter);
  if (isDemoMode()) app.use('/api/v1/delinquency', delinquencyRecoveryRouter);
  if (isDemoMode()) app.use('/api/v1/accounting', accountingDemoRouter);
  if (isDemoMode()) app.use('/api/v1/hr', hrDemoRouter);
  if (isDemoMode()) app.use('/api/v1/work', workDemoRouter);
  if (isDemoMode()) app.use('/api/v1/insurance', insWelfareRouter);
  if (isDemoMode()) app.use('/api/v1/coop', coopGovRouter);
  if (isDemoMode()) app.use('/api/v1/programs', programsRouter);
  if (isDemoMode()) app.use('/api/v1/mis', misRouter);
  if (isDemoMode()) app.use('/api/v1/mis-ops', misOpsRouter);
  if (isDemoMode()) app.use('/api/v1/comms', commRouter);
  if (isDemoMode()) app.use('/api/v1/documents', documentsRouter);
  if (isDemoMode()) app.use('/api/v1/security', securityRouter);
  if (isDemoMode()) app.use('/api/v1/privacy', privacyRouter);
  // Public verification (req 7) — mounted without auth intentionally.
  app.use('/api/v1/public', publicVerifyRouter);
  if (isDemoMode()) app.use('/api/v1/comms/bulk', commBulkRouter);

  // 404 for unknown API paths.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Central error handler (must be last) ─────────────────────────────────
  app.use(errorHandler);

  return app;
}
