import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import { getEnv } from "./config.ts";

const AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * The Edge clients are typed against the generated schema so that a write to
 * a column the database no longer has fails `deno check` — not production
 * (GAP-09.0: `delete-account` wrote `profiles.role` after `0048` dropped it,
 * and PostgREST refused the update at runtime).
 */
export function serviceClient(): SupabaseClient<Database> {
  const env = getEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: AUTH_OPTIONS,
    global: { headers: { "x-client-info": "kickoff-edge" } },
  });
}

/** Anon client that forwards the caller's JWT so RLS applies. */
export function userClient(accessToken: string): SupabaseClient<Database> {
  const env = getEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: AUTH_OPTIONS,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-client-info": "kickoff-edge",
      },
    },
  });
}
