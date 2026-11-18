-- 0056 — two real statuses.
--
-- A postponed fixture keeps its kickoff until the club reschedules it; a
-- cancelled fixture is terminal. Both stop sales and both are ignored by the
-- match clock (0058).
--
-- Postgres cannot use a value added by `ALTER TYPE` in the transaction that
-- adds it, so the enum lives alone in this migration. 0057 uses the values.
alter type public.match_status add value if not exists 'postponed';
alter type public.match_status add value if not exists 'cancelled';
