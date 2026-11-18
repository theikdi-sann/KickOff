-- 0061 — refresh PostgREST after this cycle's new RPCs and tables.
--
-- PostgREST discovers functions and tables from its schema cache. A migration
-- that adds `admin_set_match_result()` or `match_notifications` can land in
-- Postgres while the running API still answers "Could not find the function
-- ... in the schema cache". The notification is transactional: it is delivered
-- when the migration commits, so the console sees the RPC immediately.
notify pgrst, 'reload schema';
