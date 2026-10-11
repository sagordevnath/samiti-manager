import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

/**
 * ── Supabase clients ────────────────────────────────────────────────────────
 *
 * `supabaseAdmin` — the privileged data client. It authenticates as
 * service_role (the key is sent on every request), bypasses RLS, and is the
 * ONLY client app code may use for reads/writes.
 *
 * `supabaseAuth` — a separate client used exclusively for GoTrue (auth) calls
 * such as signInWithPassword/refreshSession.
 *
 * Why two clients: supabase-js keeps the signed-in session ON THE CLIENT and
 * sends that session's access token as the `Authorization` header for every
 * later PostgREST request. Signing a user in through the shared data client
 * therefore rewrote the API's identity for the whole process — after the first
 * login every query ran as `authenticated` instead of service_role. Tables
 * whose RLS policies have no INSERT/UPDATE rule (the majority: the schema
 * grants writes only to service_role) then failed with
 * `42501 new row violates row-level security policy`, which surfaced as 500s
 * across unrelated pages. Isolating GoTrue to its own client keeps the data
 * client at service_role for the process lifetime.
 *
 * NEVER expose either client to the browser and never call `.auth.*` on
 * `supabaseAdmin`.
 */
const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
} as const;

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);

/** GoTrue-only client (login / refresh / sign-out). Session state stays here. */
export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);

/**
 * Guard used by tests and startup diagnostics: the data client must never hold
 * a user session, because that silently downgrades it to `authenticated`.
 */
export async function adminHasNoUserSession(): Promise<boolean> {
  const { data } = await supabaseAdmin.auth.getSession();
  return !data.session;
}
