import pino from 'pino';
import { env, isProd } from '../env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'samity-api' },
  // Session credentials must never reach logs: pino-http serializes request
  // headers, and the Authorization bearer is the user's access token.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
