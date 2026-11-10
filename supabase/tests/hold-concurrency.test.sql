-- P6-13 — 10 truly concurrent holds on one seat: exactly one succeeds.
create extension if not exists dblink;

select plan(1);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000d1', 'racer@kickoff.test')
on conflict (id) do nothing;

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('race-match', 'Race FC', 'RAC', now() + interval '7 days')
on conflict (id) do nothing;

insert into public.zones (id, match_id, name, price_satang, rows, seats_per_row)
values ('race-zone', 'race-match', 'Race Stand', 35000, array['A']::text[], 1)
on conflict (id) do nothing;

insert into public.seats (id, zone_id, row_label, number)
values ('race-seat', 'race-zone', 'A', 1)
on conflict (id) do nothing;

-- dblink workers run in separate sessions; fixtures must be committed first.
commit;

create or replace function pg_temp.run_parallel_holds(
  p_user uuid,
  p_match text,
  p_seat text,
  p_workers int
)
returns int
language plpgsql
as $$
declare
  conn text;
  successes int := 0;
  index int;
  conninfo text := case
    when inet_server_addr() is null then format('dbname=%s', current_database())
    else format('host=%s port=%s dbname=%s user=%s',
      inet_server_addr(), inet_server_port(), current_database(), current_user)
  end;
begin
  for index in 1..p_workers loop
    conn := 'race_conn_' || index;
    perform dblink_connect(conn, conninfo);
    perform *
    from dblink(
      conn,
      format(
        'select set_config(%L, %L, false), set_config(%L, %L, false)',
        'request.jwt.claim.sub', p_user::text,
        'request.jwt.claims',
        jsonb_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'customer'))::text
      )
    ) as cfg(sub text, claims text);
  end loop;

  for index in 1..p_workers loop
    conn := 'race_conn_' || index;
    perform dblink_send_query(
      conn,
      format('select public.create_hold(%L, array[%L]::text[])', p_match, p_seat)
    );
  end loop;

  for index in 1..p_workers loop
    conn := 'race_conn_' || index;
    begin
      perform 1 from dblink_get_result(conn) as result(hold jsonb);
      successes := successes + 1;
    exception
      when others then
        -- unique violation / seats already held: expected for the losers
        null;
    end;
  end loop;

  for index in 1..p_workers loop
    perform dblink_disconnect('race_conn_' || index);
  end loop;

  return successes;
end;
$$;

select is(
  pg_temp.run_parallel_holds(
    '00000000-0000-0000-0000-0000000000d1',
    'race-match',
    'race-seat',
    10
  ),
  1,
  'exactly one of 10 concurrent holds wins the seat'
);

delete from public.seat_holds where seat_id = 'race-seat';
delete from public.seats where id = 'race-seat';
delete from public.zones where id = 'race-zone';
delete from public.matches where id = 'race-match';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';

select * from finish();
