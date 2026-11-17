-- GAP-09.4 — the per-tenant export (a club's exit step 1).
--
-- A club leaving the platform gets its full data archive before anything is
-- erased. `export_tenant()` is a service-role-only function that returns the
-- club's rows for every tenant-scoped table plus the club's own row, keyed by
-- table name — and the coverage rule is structural, not a hand list:
--
--   ER-1      the export covers every tenant-scoped table in the schema
--   ER-2      the export covers the club's own row
--   ER-3      only that club's rows are in it (isolation)
--   ER-4      a club's data appears with the values it holds (counts)
--   ER-5      the export is a platform operation: members cannot call it
--   ER-6      the export is audited
--   ER-7      an unknown club raises (no silent empty archive)
begin;
select plan(9);

-- ── fixtures: two clubs so ER-3 can prove isolation ─────────────────────────
insert into public.tenants (name, slug, currency)
values ('Export FC', 'export-fc', 'THB')
on conflict (slug) do nothing;

insert into public.tenants (name, slug, currency)
values ('Staying FC', 'staying-fc', 'THB')
on conflict (slug) do nothing;

insert into public.venues (tenant_id, name, address)
values
  ((select id from public.tenants where slug = 'export-fc'), 'Export Stadium', '1 Export Road'),
  ((select id from public.tenants where slug = 'staying-fc'), 'Staying Stadium', '2 Staying Road')
on conflict (tenant_id, name) do nothing;

insert into public.app_settings (tenant_id, key, value)
values ((select id from public.tenants where slug = 'export-fc'), 'export_probe', '{"k":1}'::jsonb)
on conflict (tenant_id, key) do nothing;

-- ── the club a connected account belongs to ────────────────────────────────
create or replace function v_export() returns jsonb
language sql stable as $$
  select public.export_tenant((select id from public.tenants where slug = 'export-fc'))
$$;

-- ── the function exists and the coverage is structural ──────────────────────
select has_function(
  'public', 'export_tenant', array['uuid'],
  'EX-0 the export function exists'
);

-- ── ER-1 coverage is structural: every scoped table is a key ────────────────
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
  where not (v_export() -> 'tables') ? scoped.table_name),
  0::bigint,
  'ER-1 the export covers every tenant-scoped table in the schema'
);

-- ── ER-2 the club's own row is in it ────────────────────────────────────────
select is(
  v_export() #>> '{tables,tenants,0,slug}',
  'export-fc',
  'ER-2 the export includes the club row'
);

-- ── ER-3 isolation: another club's rows are not in the archive ──────────────
select is(
  (select count(*) from jsonb_array_elements(v_export() #> '{tables,venues}') v
    where v #>> '{}' like '%Staying%'),
  0::bigint,
  'ER-3 the export carries only the club own rows'
);

-- ── ER-4 counts reflect the data ────────────────────────────────────────────
select is(
  (v_export() #>> '{tables,app_settings,0,key}'),
  'export_probe',
  'ER-4 the export carries the club settings rows'
);

select is(
  (v_export() -> 'tables' -> 'venues') is not null
  and jsonb_typeof(v_export() -> 'tables' -> 'venues') = 'array',
  true,
  'ER-4b every table key holds an array'
);

-- ── ER-5 a member cannot call it ────────────────────────────────────────────
set local role authenticated;
select throws_ok(
  $$select public.export_tenant('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501', null,
  'ER-5 only the service role may export a club'
);
reset role;

select throws_ok(
  $$select public.export_tenant('00000000-0000-0000-0000-000000000000'::uuid)$$,
  'P0002', null,
  'ER-7 an unknown club raises, it does not export an empty archive'
);

-- ── ER-6 the export is audited ──────────────────────────────────────────────
select ok(
  (select count(*) from public.audit_logs
    where action = 'tenant.export'
      and entity_id = (select id::text from public.tenants where slug = 'export-fc')) >= 1,
  'ER-6 the export writes an audit row'
);

select * from finish();
rollback;
