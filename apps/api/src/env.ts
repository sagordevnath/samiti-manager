import { z } from 'zod';

/**
 * Fail fast at boot: parse env once, export a typed config.
 * In tests SUPABASE_* values are dummies — no network calls are made.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().default(4000)),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('service-role-placeholder'),
  SUPABASE_JWT_SECRET: z.string().default('test-jwt-secret'),

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
