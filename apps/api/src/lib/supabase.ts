import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

/**
 * Service-role client: bypasses RLS. NEVER expose to the browser and never
 * import this from app code — server-side admin operations only.
 * Request-scoped work that must respect RLS should use the user's access token
 * (see middleware/auth.ts) rather than this client.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
