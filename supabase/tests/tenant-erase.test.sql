-- GAP-09.5 — the tenant erase (a club's exit step 2).
--
-- The money rule first: a club's data is erased only after a human signed the
-- money hand-back off (docs/PRIVACY.md — the runbook checklist: final payout
-- confirmed, connected account disconnected). `mark_tenant_offboarded()` is
-- what that sign-off sets; `erase_tenant()` refuses until it is set.
--
--   EE-0      the functions exist
--   EE-1      erase refuses a club nobody offboarded
--   EE-2      the offboarding mark is audited
--   EE-3      erase covers every tenant-scoped table (structural, like ER-1)
--   EE-4      another club's data is untouched
--   EE-5      the tenants row survives as the tombstone: `erased_at` set, the
--             Connect account and branding gone, name and slug kept
--   EE-6      the tombstone audit row survives the purge
--   EE-7      erase is idempotent — a second run is a no-op
begin;
select plan(11);

-- ── fixtures: two clubs, one to erase ───────────────────────────────────────
insert into public.tenants (name, slug, currency, stripe_account_id, primary_color, logo_url)
values ('Exit FC', 'exit-fc', 'THB', 'acct_exit_fc', '#ff0000', 'https://cdn.kickoff.example/exit.png')
on conflict (slug) do nothing;

insert into public.tenants (name, slug, currency)
values ('Staying FC', 'staying-fc', 'THB')
on conflict (slug) do nothing;

insert into public.venues (tenant_id, name, address)
values
  ((select id from public.tenants where slug = 'exit-fc'), 'Exit Stadium', '1 Exit Road'),
  ((select id from public.tenants where slug = 'staying-fc'), 'Staying Stadium', '2 Staying Road')
on conflict (tenant_id, name) do nothing;

insert into public.app_settings (tenant_id, key, value)
values ((select id from public.tenants where slug = 'exit-fc'), 'exit_probe', '{"k":1}'::jsonb)
on conflict (tenant_id, key) do nothing;

-- ── EE-1 the human gate ─────────────────────────────────────────────────────
select has_function('public', 'mark_tenant_offboarded', array['uuid'],
  'EE-0a the offboarding mark exists');

select has_function('public', 'erase_tenant', array['uuid'],
  'EE-0b the erase exists');

select throws_ok(
  $$select public.erase_tenant((select id from public.tenants where slug = 'exit-fc'))$$,
  'P0001', null,
  'EE-1 erase refuses a club nobody offboarded'
);

-- ── EE-2 the offboarding mark is audited ────────────────────────────────────
select public.mark_tenant_offboarded((select id from public.tenants where slug = 'exit-fc'));

select is(
  (select count(*) from public.audit_logs
    where action = 'tenant.offboarded'
      and entity_id = (select id::text from public.tenants where slug = 'exit-fc')),
  1::bigint,
  'EE-2 the offboarding mark is audited'
);

select throws_ok(
  $$select public.mark_tenant_offboarded('00000000-0000-0000-0000-000000000000'::uuid)$$,
  'P0002', null,
  'EE-2b an unknown club raises'
);

-- ── EE-3/EE-4 the erase ─────────────────────────────────────────────────────
create or replace function v_erase() returns jsonb
language sql stable as $$
  select public.erase_tenant((select id from public.tenants where slug = 'exit-fc'))
$$;

select is(
  (select count(*) from (
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
      and t.table_type = 'BASE TABLE'
  ) scoped
  where not (v_erase() -> 'deleted') ? scoped.table_name),
  0::bigint,
  'EE-3 the erase covers every tenant-scoped table in the schema'
);

select is(
  (select count(*) from public.app_settings where key = 'exit_probe'),
  0::bigint,
  'EE-3b the club rows are gone'
);

select is(
  (select count(*) from public.venues where name = 'Staying Stadium'),
  1::bigint,
  'EE-4 another club data is untouched'
);

-- ── EE-5 the tombstone ──────────────────────────────────────────────────────
select is(
  (select erased_at is not null
    and stripe_account_id is null
    and primary_color = ''
    and logo_url is null
    and name = 'Exit FC'
    and slug = 'exit-fc'
  from public.tenants where slug = 'exit-fc'),
  true,
  'EE-5 the tenants row survives as the tombstone'
);

-- ── EE-6 the tombstone audit row survives the purge ─────────────────────────
select is(
  (select count(*) from public.audit_logs
    where action = 'tenant.erased'
      and entity_id = (select id::text from public.tenants where slug = 'exit-fc')),
  1::bigint,
  'EE-6 the tombstone audit row survives the purge'
);

-- ── EE-7 a second erase is a no-op ──────────────────────────────────────────
select ok(
  (select (v_erase() -> 'deleted') = '{
    "app_settings": 0, "audit_logs": 0, "gates": 0, "match_gates": 0, "match_notifications": 0,
    "match_zone_prices": 0, "matches": 0, "news_items": 0, "order_seats": 0,
    "orders": 0, "refunds": 0, "scan_events": 0, "seat_holds": 0, "seats": 0,
    "staff_members": 0, "staff_roles": 0, "stripe_events": 0, "tickets": 0,
    "venues": 0, "zones": 0
  }'::jsonb),
  'EE-7 a second erase deletes nothing'
);

select * from finish();
rollback;
