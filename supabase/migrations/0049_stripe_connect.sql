-- C8.1 — Stripe Connect: the money path (ADR-003).
--
-- Every club sells on its own connected account: the club is the merchant of
-- record, the platform takes its fee from the same charge (a direct charge
-- with an application fee), and the webhook resolves the club from the
-- Connect account the event carries.
--
-- The database owns two rules, because both are money and neither can be
-- proven without a Stripe account:
--
--   * `application_fee_minor_units()` — the platform fee in integer minor
--     units, rounded to the nearest unit, from the club's
--     `application_fee_bps`;
--   * `tenant_for_stripe_account()` — the club a Connect account belongs to.
--
-- The bridge: a club without a connected account is not onboarded yet. It
-- keeps selling on the platform account with no platform fee, exactly as it
-- did before Connect — the platform is the merchant of record for it until
-- the onboarding in C9 gives it an account. The event ledger therefore
-- resolves a club from the account when there is one, and the order carries
-- the club when there is not.

-- ── the event ledger learns its club ─────────────────────────────────────────
alter table public.stripe_events
  add column if not exists tenant_id uuid
    references public.tenants (id) on delete set null;

alter table public.stripe_events
  add column if not exists account_id text;

alter table public.stripe_events
  add column if not exists payload jsonb;

-- One connected account, one club: the webhook resolves the club by account.
create unique index if not exists tenants_stripe_account_key
  on public.tenants (stripe_account_id)
  where stripe_account_id is not null;

-- ── the platform fee ────────────────────────────────────────────────────────
create or replace function public.application_fee_minor_units(
  p_amount_minor_units integer,
  p_fee_bps integer
)
returns integer
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_amount_minor_units is null or p_amount_minor_units < 0 then
    raise exception 'Amount must not be negative' using errcode = '22023';
  end if;
  if p_fee_bps is null or p_fee_bps < 0 or p_fee_bps > 10000 then
    raise exception 'Fee must be between 0 and 10000 basis points' using errcode = '22023';
  end if;
  return round(p_amount_minor_units::numeric * p_fee_bps / 10000)::integer;
end;
$$;

revoke all on function public.application_fee_minor_units(integer, integer) from public;
grant execute on function public.application_fee_minor_units(integer, integer)
  to authenticated, service_role;

-- ── the club a Connect account belongs to ───────────────────────────────────
create or replace function public.tenant_for_stripe_account(p_account_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  where p_account_id is not null
    and t.stripe_account_id = p_account_id
  limit 1;
$$;

revoke all on function public.tenant_for_stripe_account(text) from public;
grant execute on function public.tenant_for_stripe_account(text)
  to authenticated, service_role;
