-- 0038_atomic_reschedule_refund — F-07: the change and its proof are one
-- transaction.
--
-- Before this migration the staff console wrote the fixture from the browser
-- and *then* the reschedule row: a failure in between moved a kickoff with no
-- record of who moved it or why. `refund-order` went the other way round —
-- Stripe first, then four separate database writes — so a failure left a
-- refunded Stripe payment on an order still marked `paid`.
--
-- Both halves now converge on a single database call each:
--   * admin_update_match()   — kickoff change + {from, to, reason} audit row,
--   * mark_order_refunded()  — order + tickets + seats + audit row.
--
-- The reschedule *rules* (no earlier kickoff, lock window, upcoming-only)
-- still live in shared Zod + the admin UI (D-06 — deliberately no trigger).
-- These functions enforce atomicity and audit completeness, not the rules.

-- ── reschedule ──────────────────────────────────────────────────────────────
create or replace function public.admin_update_match(
  p_match_id text,
  p_patch jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.matches%rowtype;
  v_after public.matches%rowtype;
  v_fields text[];
  v_bad text;
  v_kickoff_changed boolean;
  v_allowed constant text[] := array[
    'opponent', 'opponent_short', 'kickoff_at', 'venue_id',
    'competition', 'home_away', 'poster_colors', 'accent'
  ];
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object' using errcode = '22023';
  end if;

  select * into v_before
    from public.matches
    where id = p_match_id
    for update;
  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  select array_agg(k) into v_fields
    from jsonb_object_keys(p_patch) as t(k);

  select k into v_bad
    from unnest(coalesce(v_fields, array[]::text[])) as t(k)
    where k <> all (v_allowed)
    limit 1;
  if v_bad is not null then
    raise exception 'Column % is not editable', v_bad using errcode = '22023';
  end if;

  -- Audit completeness: a kickoff may not move without a justification.
  -- Checked before the write so a refused call touches nothing at all.
  if p_patch ? 'kickoff_at'
    and (p_patch ->> 'kickoff_at')::timestamptz is distinct from v_before.kickoff_at
    and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'A reschedule must carry a reason' using errcode = 'P0001';
  end if;

  update public.matches set
    opponent = case when p_patch ? 'opponent'
                    then p_patch ->> 'opponent' else opponent end,
    opponent_short = case when p_patch ? 'opponent_short'
                          then p_patch ->> 'opponent_short' else opponent_short end,
    kickoff_at = case when p_patch ? 'kickoff_at'
                      then (p_patch ->> 'kickoff_at')::timestamptz else kickoff_at end,
    venue_id = case when p_patch ? 'venue_id'
                    then p_patch ->> 'venue_id' else venue_id end,
    competition = case when p_patch ? 'competition'
                       then p_patch ->> 'competition' else competition end,
    home_away = case when p_patch ? 'home_away'
                     then p_patch ->> 'home_away' else home_away end,
    poster_colors = case when p_patch ? 'poster_colors'
                         then (select array(
                                 select jsonb_array_elements_text(p_patch -> 'poster_colors')
                               ))
                         else poster_colors end,
    accent = case when p_patch ? 'accent'
                  then p_patch ->> 'accent' else accent end
  where id = p_match_id
  returning * into v_after;

  v_kickoff_changed := v_after.kickoff_at is distinct from v_before.kickoff_at;

  if v_kickoff_changed then
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (
      auth.uid(),
      'reschedule',
      'match',
      v_after.id,
      jsonb_build_object(
        'from', to_jsonb(v_before.kickoff_at),
        'to', to_jsonb(v_after.kickoff_at),
        'reason', trim(p_reason)
      )
    );
  end if;

  return jsonb_build_object(
    'row', to_jsonb(v_after),
    'venue_name', coalesce(
      (select name from public.venues where id = v_after.venue_id), ''
    ),
    'rescheduled', v_kickoff_changed
  );
end;
$$;

revoke execute on function public.admin_update_match(text, jsonb, text)
  from public, anon;
grant execute on function public.admin_update_match(text, jsonb, text)
  to authenticated;

-- ── refund ──────────────────────────────────────────────────────────────────
-- Called by the refund-order Edge Function *after* Stripe accepted the
-- refund. One call flips the order, voids the tickets, releases the seats
-- and writes the audit row — so the database half either happens completely
-- or not at all. The idempotent early return makes a retry after a failure
-- safe instead of double-refunding.
create or replace function public.mark_order_refunded(
  p_order_id text,
  p_actor_id uuid,
  p_refund_id text,
  p_reason text default null,
  p_override_used_tickets boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_used integer;
  v_freed integer := 0;
begin
  select * into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.status = 'refunded' then
    return jsonb_build_object('refunded', true, 'alreadyRefunded', true);
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Only paid orders can be refunded' using errcode = 'P0001';
  end if;

  select count(*) into v_used
    from public.tickets
    where order_id = p_order_id and status = 'used';

  if v_used > 0 and not coalesce(p_override_used_tickets, false) then
    raise exception 'Refunding used tickets requires the override'
      using errcode = 'P0001';
  end if;

  update public.orders set status = 'refunded' where id = p_order_id;
  update public.tickets set status = 'void' where order_id = p_order_id;

  if not coalesce(p_override_used_tickets, false) then
    v_freed := public.free_seats_for_order(p_order_id);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    p_actor_id,
    'order.refund',
    'orders',
    p_order_id,
    jsonb_build_object(
      'refund_id', p_refund_id,
      'amount_satang', v_order.amount_satang,
      'reason', p_reason,
      'override_used_tickets', coalesce(p_override_used_tickets, false),
      'used_tickets', v_used
    )
  );

  return jsonb_build_object(
    'refunded', true,
    'alreadyRefunded', false,
    'seatsFreed', v_freed
  );
end;
$$;

revoke execute on function public.mark_order_refunded(text, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.mark_order_refunded(text, uuid, text, text, boolean) to service_role;
