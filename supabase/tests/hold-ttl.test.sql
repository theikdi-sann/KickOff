-- P6-14 — expired holds free the seat; the kickoff lock rejects late holds.
begin;
select plan(3);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000d2', 'ttl@xclub.test')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

insert into public.matches (id, opponent, opponent_short, kickoff_at) values
  ('ttl-match', 'TTL FC', 'TTL', now() + interval '7 days'),
  ('lock-match', 'Late FC', 'LTE', now() + interval '10 minutes')
on conflict (id) do nothing;

insert into public.zones (id, match_id, name, price_satang, rows, seats_per_row) values
  ('ttl-zone', 'ttl-match', 'TTL Stand', 35000, array['A']::text[], 1),
  ('lock-zone', 'lock-match', 'Late Stand', 35000, array['A']::text[], 1)
on conflict (id) do nothing;

insert into public.seats (id, zone_id, row_label, number) values
  ('ttl-seat', 'ttl-zone', 'A', 1),
  ('lock-seat', 'lock-zone', 'A', 1)
on conflict (id) do nothing;

-- An already-expired hold still occupies the unique index.
insert into public.seat_holds (id, hold_group_id, seat_id, user_id, expires_at)
values (
  'ttl-expired',
  'ttl-expired-group',
  'ttl-seat',
  '00000000-0000-0000-0000-0000000000d2',
  now() - interval '1 minute'
);

select isnt(
  public.create_hold('ttl-match', array['ttl-seat']),
  null::jsonb,
  'create_hold can take a seat whose previous hold expired'
);

select isnt(
  (select released_at from public.seat_holds where id = 'ttl-expired'),
  null::timestamptz,
  'the expired hold row is released'
);

select throws_ok(
  $$ select public.create_hold('lock-match', array['lock-seat']) $$,
  'P0001',
  null,
  'holds are rejected inside the kickoff lock window'
);

select * from finish();
rollback;
