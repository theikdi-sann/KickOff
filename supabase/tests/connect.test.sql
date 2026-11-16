-- C8.1 / 0049 — Stripe Connect: the money path.
--
-- ADR-003 puts every club on its own connected account: the club is the
-- merchant of record, the platform takes its fee from the same charge (a
-- direct charge with an application fee), and the webhook resolves the club
-- from the Connect account the event carries.
--
-- This suite pins the rules the *database* owns, because money rules that
-- only live in an Edge Function cannot be proven without a Stripe account:
--
--   CN-1..CN-5  the platform fee — integer minor units, rounded to the
--                nearest unit, from the club's `application_fee_bps`
--   CN-6..CN-9  the club a Connect account belongs to (one account, one club)
--   CN-10..CN-12 the event ledger — the club, the account, the payload
--   CN-13       the bridge: a club without an account is still a club
begin;
select plan(13);

-- ── fixtures: a connected club and a plain one ──────────────────────────────
insert into public.tenants (name, slug, currency, stripe_account_id, application_fee_bps)
values ('Connect FC', 'connect-fc', 'THB', 'acct_connect_fc', 250)
on conflict (slug) do nothing;

insert into public.tenants (name, slug, currency)
values ('Plain FC', 'plain-fc', 'THB')
on conflict (slug) do nothing;

-- ── CN-1..CN-5 the platform fee ─────────────────────────────────────────────
select has_function(
  'public', 'application_fee_minor_units', array['integer', 'integer'],
  'CN-1 the fee helper exists'
);

select is(
  public.application_fee_minor_units(10000, 0),
  0,
  'CN-2 no fee means no fee'
);

select is(
  public.application_fee_minor_units(10000, 250),
  250,
  'CN-3 2.5% of 100.00 is 2.50'
);

select is(
  public.application_fee_minor_units(999, 250),
  25,
  'CN-4 the fee rounds to the nearest minor unit'
);

select throws_ok(
  $$select public.application_fee_minor_units(10000, 10001)$$,
  '22023', null,
  'CN-5 a fee above 100% is refused'
);

-- ── CN-6..CN-9 the club a Connect account belongs to ────────────────────────
select has_function(
  'public', 'tenant_for_stripe_account', array['text'],
  'CN-6 the account resolver exists'
);

select is(
  public.tenant_for_stripe_account('acct_connect_fc')::text,
  (select id::text from public.tenants where slug = 'connect-fc'),
  'CN-7 the account resolves to its club'
);

select is(
  public.tenant_for_stripe_account('acct_nobody'),
  null::uuid,
  'CN-8 an unknown account resolves to no club'
);

select throws_ok(
  $$insert into public.tenants (name, slug, stripe_account_id)
     values ('Copycat FC', 'copycat-fc', 'acct_connect_fc')$$,
  '23505', null,
  'CN-9 a connected account belongs to exactly one club'
);

-- ── CN-10..CN-12 the event ledger ──────────────────────────────────────────
insert into public.stripe_events (id, type, tenant_id, account_id, payload)
values (
  'evt_connect_1', 'checkout.session.completed',
  (select id from public.tenants where slug = 'connect-fc'),
  'acct_connect_fc',
  '{"id":"evt_connect_1"}'::jsonb
);

select is(
  (select tenant_id::text from public.stripe_events where id = 'evt_connect_1'),
  (select id::text from public.tenants where slug = 'connect-fc'),
  'CN-10 the ledger records the club the event belongs to'
);

select is(
  (select account_id from public.stripe_events where id = 'evt_connect_1'),
  'acct_connect_fc',
  'CN-11 the ledger records the Connect account it came from'
);

select is(
  (select payload ->> 'id' from public.stripe_events where id = 'evt_connect_1'),
  'evt_connect_1',
  'CN-12 the ledger keeps the payload for post-mortems'
);

-- ── CN-13 the bridge ────────────────────────────────────────────────────────
-- A club without a connected account is not onboarded yet: it keeps selling
-- on the platform account, with no platform fee. Onboarding (C9) gives it an
-- account; until then the platform is the merchant of record for it.
select is(
  (select stripe_account_id from public.tenants where slug = 'plain-fc'),
  null::text,
  'CN-13 a club without a connected account is still a club'
);

select * from finish();
rollback;
