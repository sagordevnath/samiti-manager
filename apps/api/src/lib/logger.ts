import pino from 'pino';
import { env, isProd } from '../env.js';

/**
 * pino-pretty runs as a worker-thread transport. Under Vitest every test worker
 * would spawn its own thread purely to format logs — slow, and prone to
 * transient file-read failures on Windows/OneDrive checkouts that surface as
 * "the worker has exited" and fail otherwise-passing runs. Tests log raw JSON.
 */
const usePrettyTransport = !isProd && env.NODE_ENV !== 'test';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'samity-api' },
  // Session credentials must never reach logs: pino-http serializes request
  // headers, and the Authorization bearer is the user's access token.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  transport: usePrettyTransport
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
});
