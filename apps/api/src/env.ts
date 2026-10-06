import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

/**
 * Fail fast at boot: parse env once, export a typed config.
 * In tests SUPABASE_* values are dummies — no network calls are made.
 *
 * Without the Infisical CLI, secrets come from a checked-out .env file.
 * Load (non-overriding, so real environment variables always win):
 *   1. apps/api/.env  (module-specific)
 *   2. <repo-root>/.env (the template .env.example lives at the root)
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const apiEnvPath = path.resolve(here, '../../.env');
const rootEnvPath = path.resolve(here, '../../../.env');
if (existsSync(apiEnvPath)) dotenv.config({ path: apiEnvPath });
if (existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath });
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().default(4000)),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Defaults were intentionally removed (they previously held a real-looking
  // project ref + a corrupted service key that made the API fail "live" with
  // 500s instead of falling back to demo mode). Without real env values the
  // zod defaults now match demo mode's placeholder checks.
  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('service-role-placeholder'),
  SUPABASE_JWT_SECRET: z.string().default('placeholder-jwt-secret-not-for-production'),

  /** Master key for member-identity field encryption (base64/passphrase). */
  MEMBER_ENC_KEY: z.string().min(8).default('dev-only-member-encryption-master-key'),
  SAVINGS_INTEREST_FREQUENCY: z.enum(['monthly', 'yearly']).default('monthly'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
