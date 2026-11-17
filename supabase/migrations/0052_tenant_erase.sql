-- 0052 — GAP-09.5: the tenant erase (a club's exit step 2).
--
-- The money rule comes first. `docs/PRIVACY.md` locks the decision: a club's
-- data is erased only after a human signed the money hand-back off — the
-- runbook checklist (final payout confirmed, connected account
-- disconnected). The sign-off is a state on the club:
--
--   * `mark_tenant_offboarded()` — what the operator's sign-off sets, audited
--   * `erase_tenant()` — refuses until `offboarded_at` is set, then deletes
--     every tenant-scoped row (children first), scans through the sanctioned
--     maintenance path, nulls the club's branding and Connect account, and
--     keeps the `tenants` row as the tombstone (`erased_at`)
--
-- The tombstone is deliberate: the club existed, and the erase happened —
-- provable without keeping the club's data. The tombstone audit row is
-- written *after* the purge, so it survives it — and a re-erase is a no-op
-- that leaves the first tombstone in place.

alter table public.tenants
  add column if not exists offboarded_at timestamptz,
  add column if not exists erased_at timestamptz;

-- ── the human gate ──────────────────────────────────────────────────────────
create or replace function public.mark_tenant_offboarded(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  select exists(select 1 from public.tenants where id = p_tenant_id) into v_exists;
  if not v_exists then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  update public.tenants
  set offboarded_at = now(), updated_at = now()
  where id = p_tenant_id and offboarded_at is null;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, metadata)
  values (
    p_tenant_id, null, 'tenant.offboarded', 'tenants', p_tenant_id::text,
    jsonb_build_object('marked_by', 'mark_tenant_offboarded')
  );
end;
$$;

-- ── the erase ───────────────────────────────────────────────────────────────
create or replace function public.erase_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offboarded boolean;
  -- Children before parents: the composite foreign keys cascade, but the
  -- explicit order is what makes each count an honest number rather than a
  -- cascade's side effect. Children of children are already gone when their
  -- parent's delete runs.
  v_tables text[] := array[
    'seat_holds',
    'scan_events',
    'tickets',
    'order_seats',
    'refunds',
    'orders',
    'match_gates',
    'gates',
    'match_zone_prices',
    'zones',
    'seats',
    'matches',
    'news_items',
    'app_settings',
    'staff_members',
    'staff_roles',
    'stripe_events',
    'venues',
    -- The club's own audit trail is purged last, and the tombstone rows are
    -- exempt: the record that the erase happened must survive the erase.
    'audit_logs'
  ];
  v_name text;
  v_deleted jsonb := '{}'::jsonb;
  v_rows bigint;
begin
  select exists(
    select 1 from public.tenants
    where id = p_tenant_id and offboarded_at is not null
  ) into v_offboarded;
  if not v_offboarded then
    -- Unknown club, or a club nobody offboarded: the same refusal — the
    -- exit procedure did not run, so there is nothing to erase.
    raise exception 'Tenant not offboarded' using errcode = 'P0001';
  end if;

  -- The append-only scan log is purged through its sanctioned path, not
  -- around it: the session flag plus the owner role the trigger demands
  -- (0044). The definer runs as the owner, the flag is the explicit intent.
  perform set_config('kickoff.scan_events_maintenance', 'on', true);

  foreach v_name in array v_tables loop
    if v_name = 'audit_logs' then
      delete from public.audit_logs
      where tenant_id = p_tenant_id and action <> 'tenant.erased';
    else
      execute format('delete from public.%I where tenant_id = $1', v_name)
        using p_tenant_id;
    end if;
    get diagnostics v_rows = row_count;
    v_deleted := jsonb_set(v_deleted, array[v_name], to_jsonb(v_rows));
  end loop;

  -- The `tenants` row survives as the tombstone: the club existed, the erase
  -- happened. Everything the club configured is gone; the name and slug stay
  -- so the record can be read.
  update public.tenants
  set logo_url = null,
      primary_color = '',
      stripe_account_id = null,
      erased_at = now(),
      updated_at = now()
  where id = p_tenant_id;

  -- One tombstone per club: a re-erase does not add a second one.
  if not exists (
    select 1 from public.audit_logs
    where tenant_id = p_tenant_id and action = 'tenant.erased'
  ) then
    insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (
      p_tenant_id, null, 'tenant.erased', 'tenants', p_tenant_id::text,
      jsonb_build_object('deleted', v_deleted, 'erased_by', 'erase_tenant')
    );
  end if;

  return jsonb_build_object(
    'tenant_id', p_tenant_id,
    'erased_at', now(),
    'deleted', v_deleted
  );
end;
$$;

revoke all on function public.mark_tenant_offboarded(uuid) from public, authenticated;
revoke all on function public.erase_tenant(uuid) from public, authenticated;
grant execute on function public.mark_tenant_offboarded(uuid) to service_role;
grant execute on function public.erase_tenant(uuid) to service_role;
