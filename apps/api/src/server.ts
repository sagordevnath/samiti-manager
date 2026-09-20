import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 samity-api listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/** Graceful shutdown for containers and CI. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
  });
}
