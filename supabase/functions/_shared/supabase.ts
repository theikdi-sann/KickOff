import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "./config.ts";

const AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/** Service-role client. Never expose this to a client bundle. */
export function serviceClient(): SupabaseClient {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: AUTH_OPTIONS,
    global: { headers: { "x-client-info": "kickoff-edge" } },
  });
}

/** Anon client that forwards the caller's JWT so RLS applies. */
export function userClient(accessToken: string): SupabaseClient {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: AUTH_OPTIONS,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-client-info": "kickoff-edge",
      },
    },
  });
}
