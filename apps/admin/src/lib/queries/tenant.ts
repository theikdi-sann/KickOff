import { createClient } from "@/lib/supabase/client";

/**
 * The club this session writes to — the same value the database uses for
 * `tenant_id` defaults and RLS (`current_tenant()`: the JWT's
 * `app_metadata.tenant_id`, falling back to the default club while the
 * claim does not exist yet).
 *
 * Per-club uniques (0046) make name lookups ambiguous without it: two clubs
 * may hold a venue or a setting with the same name, and the catalogue read
 * side is deliberately open, so RLS does not scope these reads for us.
 */
export async function currentTenantId(): Promise<string> {
  const { data, error } = await createClient().rpc("current_tenant");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("current_tenant() resolved to no club");
  return data;
}
