-- 0029_scan_search_path — pgcrypto lives in the `extensions` schema on Supabase.
-- The scan RPC hashes the raw payload, so `digest()` must be resolvable.
alter function public.scan_ticket(text, text, uuid, text, text, text)
  set search_path = public, extensions;

alter function public.undo_scan(text, uuid, text)
  set search_path = public, extensions;
