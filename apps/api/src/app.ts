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
import { navRouter } from './routes/nav.routes.js';
import { orgRouter } from './routes/org.routes.js';
import { samityRouter } from './routes/samity.routes.js';
import { treeRouter } from './routes/tree.routes.js';
import { savingsRouter } from './routes/savings.routes.js';
import { savingsDemoRouter } from './routes/savings.demo.routes.js';
import { loansRouter } from './routes/loans.routes.js';
import { loansDemoRouter } from './routes/loans.demo.routes.js';
import { collectionDemoRouter } from './routes/collection.demo.routes.js';
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

  // ── Routes (versioned) ────────────────────────────────────────────────────
  app.get('/', (_req, res) => res.json({ name: 'samity-api', status: 'ok' }));
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/members', membersRouter);
  app.use('/api/v1/samities', samityRouter);
  app.use('/api/v1/nav', navRouter);
  app.use('/api/v1/org', orgRouter);
  app.use('/api/v1/org', treeRouter);
  // Demo mode (placeholder Supabase env / tests) serves the in-memory store;
  // a configured project gets the real Supabase-backed router.
  app.use('/api/v1/savings', isDemoMode() ? savingsDemoRouter : savingsRouter);
  app.use('/api/v1/loans', isDemoMode() ? loansDemoRouter : loansRouter);
  if (isDemoMode()) app.use('/api/v1/collection', collectionDemoRouter);

  // 404 for unknown API paths.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Central error handler (must be last) ─────────────────────────────────
  app.use(errorHandler);

  return app;
}
