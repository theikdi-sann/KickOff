import type { Database } from '@kickoff/shared';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy apps/admin/.env.local.example to .env.local.',
    );
  }
  return { url, anonKey };
}

/**
 * Server-side Supabase client for Server Components, Server Actions and Route
 * Handlers. Cookie writes are a no-op in Server Components (Next disallows them);
 * the proxy refreshes the session cookie instead.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — the proxy owns cookie refresh.
        }
      },
    },
  });
}
