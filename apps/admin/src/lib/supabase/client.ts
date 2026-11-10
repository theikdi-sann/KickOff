'use client';

import type { Database } from '@kickoff/shared';
import { createBrowserClient } from '@supabase/ssr';

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

/** Browser Supabase client (anon key only; RLS enforces access). */
export function createClient() {
  const { url, anonKey } = requireEnv();
  return createBrowserClient<Database>(url, anonKey);
}
