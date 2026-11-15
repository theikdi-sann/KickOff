-- C7.4 — per-club uniques: a name is unique inside a club, not worldwide.
--
-- One club per deployment made the difference invisible. With a second club
-- in the same database:
--   * `venues.name`      UNIQUE (name)        → UNIQUE (tenant_id, name)
--   * `app_settings.key` PRIMARY KEY (key)    → PRIMARY KEY (tenant_id, key)
--   * `gates.name`       (no unique at all)   → UNIQUE (tenant_id, name)
--
-- The console upserts on `name`/`key` (matches.ts, settings.ts) and the seed
-- replays `on conflict` — all move to the composite target in the same
-- change: this file runs before seed.sql on every reset, and the clients are
-- deployed with it. The old global keys blocked every second club at write
-- time, so no pre-existing duplicate can hide behind them: venues and
-- settings were globally unique (a global duplicate is also a per-club
-- duplicate), and the one table that never had a unique — `gates` — is
-- checked first and refuses loudly rather than losing rows.
--
-- Idempotent: every drop is `if exists` and every add follows its drop, so a
-- partial run re-applies cleanly.

-- ── gates.name — the table that had no unique at all ───────────────────────
do $$
begin
  if exists (
    select 1 from public.gates
    group by tenant_id, name
    having count(*) > 1
  ) then
    raise exception
      'gates has duplicate names inside one club — rename them before 0046 can guard gate names';
  end if;
end $$;

alter table public.gates drop constraint if exists gates_tenant_name_key;
alter table public.gates add constraint gates_tenant_name_key unique (tenant_id, name);

-- ── venues.name ────────────────────────────────────────────────────────────
alter table public.venues drop constraint if exists venues_name_key;
alter table public.venues drop constraint if exists venues_tenant_name_key;
alter table public.venues add constraint venues_tenant_name_key unique (tenant_id, name);

-- ── app_settings.key — the primary-key change ─────────────────────────────
-- Nothing references app_settings, so the key can move freely. The
-- tenant-led helper index from 0042 becomes the new primary key's leading
-- column and is dropped with it.
alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (tenant_id, key);
drop index if exists public.app_settings_tenant_idx;
