-- P8-11 — 10 truly concurrent scans of one valid ticket: exactly one is admitted.
create extension if not exists dblink;

select plan(3);

insert into auth.users (id, email, raw_app_meta_data)
values (
  '00000000-0000-0000-0000-0000000000d2',
  'scanner@kickoff.test',
  '{"role":"admin"}'::jsonb
)
on conflict (id) do nothing;

insert into public.matches (id, opponent, opponent_short, kickoff_at, status)
values ('scan-race-match', 'Race FC', 'RAC', now() + interval '1 hour', 'upcoming')
on conflict (id) do nothing;

insert into public.zones (id, match_id, name, price_satang, rows, seats_per_row)
values ('scan-race-zone', 'scan-race-match', 'Race Stand', 35000, array['A']::text[], 1)
on conflict (id) do nothing;

insert into public.seats (id, zone_id, row_label, number)
values ('scan-race-seat', 'scan-race-zone', 'A', 1)
on conflict (id) do nothing;

insert into public.gates (id, name, match_id, active)
values ('scan-race-gate', 'Race Gate', 'scan-race-match', true)
on conflict (id) do nothing;

insert into public.orders (id, user_id, match_id, amount_satang, status)
values (
  'scan-race-order',
  '00000000-0000-0000-0000-0000000000d2',
  'scan-race-match',
  35000,
  'paid'
)
on conflict (id) do nothing;

insert into public.order_seats
  (id, order_id, seat_id, zone_name, row_label, number, price_satang)
values
  ('scan-race-seat-row', 'scan-race-order', 'scan-race-seat', 'Race Stand', 'A', 1, 35000)
on conflict (id) do nothing;

insert into public.tickets
  (id, order_id, order_seat_id, user_id, match_id, seat_id, qr_nonce, status)
values (
  'scan-race-ticket',
  'scan-race-order',
  'scan-race-seat-row',
  '00000000-0000-0000-0000-0000000000d2',
  'scan-race-match',
  'scan-race-seat',
  'scan-race-nonce',
  'valid'
)
on conflict (id) do nothing;

update public.order_seats
set ticket_id = 'scan-race-ticket'
where id = 'scan-race-seat-row';

-- dblink workers run in separate sessions; fixtures must be committed first.
commit;

create or replace function pg_temp.run_parallel_scans(
  p_admin uuid,
  p_gate text,
  p_ticket text,
  p_workers int
)
returns jsonb
language plpgsql
as $$
declare
  conn text;
  index int;
  result jsonb;
  valid_count int := 0;
  used_count int := 0;
  conninfo text := case
    when inet_server_addr() is null then format('dbname=%s', current_database())
    else format('host=%s port=%s dbname=%s user=%s%s', inet_server_addr(),
      inet_server_port(), current_database(), current_user,
      -- Local Docker uses trust auth, so this GUC stays unset there. Hosted
      -- runs set it: set kickoff.dblink_password = '<password>';
      coalesce(format(' password=%s', current_setting('kickoff.dblink_password', true)), ''))
  end;
begin
  for index in 1..p_workers loop
    conn := 'scan_conn_' || index;
    perform dblink_connect(conn, conninfo);
    perform *
    from dblink(
      conn,
      format(
        'select set_config(%L, %L, false), set_config(%L, %L, false)',
        'request.jwt.claim.sub', p_admin::text,
        'request.jwt.claims',
        jsonb_build_object(
          'sub', p_admin,
          'role', 'authenticated',
          'app_metadata', jsonb_build_object('role', 'admin')
        )::text
      )
    ) as cfg(sub text, claims text);
  end loop;

  for index in 1..p_workers loop
    conn := 'scan_conn_' || index;
    perform dblink_send_query(
      conn,
      format(
        'select public.scan_ticket(%L, %L, %L, %L, %L, null)',
        p_ticket,
        p_gate,
        p_admin,
        'scan-race-key-' || index,
        encode(digest('scan-race-payload-' || index, 'sha256'), 'hex')
      )
    );
  end loop;

  for index in 1..p_workers loop
    conn := 'scan_conn_' || index;
    select value into result
    from dblink_get_result(conn) as response(value jsonb);

    if result ->> 'code' = 'valid' then
      valid_count := valid_count + 1;
    elsif result ->> 'code' = 'used' then
      used_count := used_count + 1;
    end if;
  end loop;

  for index in 1..p_workers loop
    perform dblink_disconnect('scan_conn_' || index);
  end loop;

  return jsonb_build_object('valid', valid_count, 'used', used_count);
end;
$$;

select is(
  (pg_temp.run_parallel_scans(
    '00000000-0000-0000-0000-0000000000d2',
    'scan-race-gate',
    'scan-race-ticket',
    10
  ) ->> 'valid')::int,
  1,
  'exactly one of 10 concurrent scans is admitted'
);

select is(
  (
    select count(*)
    from public.scan_events
    where gate_id = 'scan-race-gate'
  )::int,
  10,
  'every attempt wrote a scan event'
);

select is(
  (
    select status::text
    from public.tickets
    where id = 'scan-race-ticket'
  ),
  'used',
  'the ticket ends up used'
);

delete from public.scan_events where gate_id = 'scan-race-gate';
delete from public.tickets where id = 'scan-race-ticket';
delete from public.order_seats where id = 'scan-race-seat-row';
delete from public.orders where id = 'scan-race-order';
delete from public.gates where id = 'scan-race-gate';
delete from public.seats where id = 'scan-race-seat';
delete from public.zones where id = 'scan-race-zone';
delete from public.matches where id = 'scan-race-match';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d2';

select * from finish();
