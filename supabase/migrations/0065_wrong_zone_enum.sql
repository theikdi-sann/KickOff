-- 0065 — one more scan outcome: the pass is for another stand.
--
-- Postgres cannot use a value added by `ALTER TYPE` in the transaction that
-- adds it, so the enum lives alone here. 0066 uses it in `scan_ticket`.
alter type public.scan_result add value if not exists 'wrong_zone';
