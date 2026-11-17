-- 0051 — GAP-09.4: the per-tenant export (a club's exit step 1).
--
-- A club leaving the platform gets its full data archive before anything is
-- erased (ADR-002 §7: offboarding is an export + erase procedure). The
-- function is service-role only: a platform operation, never a member call.
--
-- The coverage rule is structural: `v_tables` is the single registry, and the
-- pgTAP suite (tenant-export.test.sql, ER-1) compares it against the schema —
-- every base table with a `tenant_id` column must be a key of the export. A
-- table that learns `tenant_id` without being registered here fails the suite
-- instead of silently falling out of the archive.
--
-- The export is audited (`tenant.export`): the exit procedure is auditable
-- end to end, and the erase step (GAP-09.5) can prove an export happened.

create or replace function public.export_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  -- The single registry of what a club's archive contains: every
  -- tenant-scoped table (the club's own row is added below — `tenants` has no
  -- `tenant_id` column to scope by).
  v_tables text[] := array[
    'app_settings',
    'audit_logs',
    'gates',
    'match_gates',
    'match_zone_prices',
    'matches',
    'news_items',
    'order_seats',
    'orders',
    'refunds',
    'scan_events',
    'seat_holds',
    'seats',
    'staff_members',
    'staff_roles',
    'stripe_events',
    'tickets',
    'venues',
    'zones'
  ];
  v_name text;
  v_data jsonb;
  v_tables_out jsonb := '{}'::jsonb;
  v_counts jsonb;
begin
  -- An unknown club raises, it does not export a silent empty archive.
  select slug into v_slug from public.tenants where id = p_tenant_id;
  if v_slug is null then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  foreach v_name in array v_tables loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
         from public.%I t where t.tenant_id = $1',
      v_name
    ) into v_data using p_tenant_id;
    v_tables_out := jsonb_set(v_tables_out, array[v_name], v_data);
  end loop;

  -- The club's own row completes the archive.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    into v_data
  from public.tenants t where t.id = p_tenant_id;
  v_tables_out := jsonb_set(v_tables_out, array['tenants'], v_data);

  select jsonb_object_agg(key, jsonb_array_length(value))
    into v_counts
  from jsonb_each(v_tables_out);

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, metadata)
  values (
    p_tenant_id,
    null,
    'tenant.export',
    'tenants',
    p_tenant_id,
    jsonb_build_object('tables', v_counts, 'exported_by', 'export_tenant')
  );

  return jsonb_build_object(
    'tenant_id', p_tenant_id,
    'slug', v_slug,
    'generated_at', now(),
    'counts', v_counts,
    'tables', v_tables_out
  );
end;
$$;

revoke all on function public.export_tenant(uuid) from public, authenticated;
grant execute on function public.export_tenant(uuid) to service_role;
