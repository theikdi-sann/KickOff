# RUNBOOK — KickOff

Operational procedures for the people who run KickOff in production: deploy,
migrate, rotate keys, respond to incidents, and recover from failure. Every
command is written to be run from the repository root unless stated otherwise.

- **Status:** living document · **Owner:** engineering
- **Last verified:** 2026-11-19 (hardware push run, §11.7)
- **Related:** [`SECURITY.md`](SECURITY.md) (controls + secret inventory) ·
  [`TESTING.md`](TESTING.md) (verification layers) ·
  [`PUSH.md`](PUSH.md) (the full end-to-end push guide) ·
  [`ARCHITECTURE.md`](ARCHITECTURE.md) (system shape)

## 1. Environments

| Environment | Where | Notes |
|---|---|---|
| Local | `npx supabase start` → `127.0.0.1:54321` (Postgres on `54322`) | `npm run db:reset` replays `supabase/migrations`; seed with `npm run db:seed-demo` |
| CI | `.github/workflows/ci.yml` | typecheck, lint, unit, pgTAP, Deno, admin build |
| Hosted | Supabase project + Vercel (admin) + EAS (mobile) | deployed manually until a CD job exists (§3) |

Environment variables live per `SECURITY.md` §1: `supabase/.env` for Edge
Functions, `apps/*/.env*` for clients (public keys only), CI secrets for the
rest. Only `*.env.example` templates are committed.

## 2. Health and monitoring

| Check | How | Normal |
|---|---|---|
| Liveness | `GET /functions/v1/health` (no auth) | 200, cheap DB check only |
| Deep health | same endpoint with `x-metrics-token` | 200 incl. Stripe API probe |
| Metrics | `GET /functions/v1/metrics` with `x-metrics-token` | aggregates, never rows |
| Logs | Supabase dashboard → Edge Functions logs | single JSON lines (`createLogger`, C4.11) |

Alert signals (per `SECURITY.md` §9): `scans.failed` spikes, `holds.conflicts`,
order-status drift, 5xx/429 spikes, `stripe_events` rows with failures.

### 2.1 Error tracking and alerting (C10.1, GAP-04)

Every server-side failure (5xx) is recorded in `error_events` with the same
`request_id` the response envelope and the `x-request-id` header carried —
one id greps the table, the envelope and the log line. Records are pruned
after 30 days (`xclub-prune-error-events`); client errors (4xx) are never
recorded, so the table stays signal.

To page a human, set the Slack-compatible channel (optional — without it
incidents are still recorded, which is what local runs and CI rely on):

```bash
npx supabase secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/services/…
```

The cooldown is 30 minutes per function+code: a failing function pages once,
not ninety times, while every occurrence keeps its row.

**Payment reconciliation.** `xclub-reconcile-payments` runs every fifteen
minutes and asks Stripe about orders that never settled — the C8.1 case: a
payment captured for a suspended club, or a webhook that never arrived. It
records a `payment_unsettled` incident for a human and **never moves money
itself** (the same rule as §9.1's money gate). Enable it once per
deployment; the job is a no-op until the URL exists:

```sql
insert into app_settings (key, value)
values ('reconciliation_url',
        '"https://<project-ref>.supabase.co/functions/v1/reconcile-payments"')
on conflict (key) do update set value = excluded.value;
```

Watch both through `GET /functions/v1/metrics`: `errors.total` (24h) and
`reconciliation.unsettled` (the number of payments still waiting for a
human).

## 3. Deploy

### 3.1 Edge Functions

```bash
npx supabase functions deploy            # all functions
npx supabase functions deploy <name>     # single function
```

After deploy, set secrets that a new function needs
(`npx supabase secrets set KEY=value`). `getEnv()` validates the environment on
first use — a missing secret fails requests loudly instead of degrading.

### 3.2 Database migrations

```bash
npx supabase db push                     # apply supabase/migrations to hosted project
```

Rules:

- Migrations run in filename order and are append-only; never edit an applied
  migration — add the next one (`0050…` is the next free number).
- Apply migrations **before** deploying functions that depend on them.
- After any schema change regenerate the shared types:
  `npm run db:types` (local) and commit the updated
  `packages/shared/src/database.types.ts`.
- Verify locally first: `npm run db:reset && npm run db:test` (pgTAP).

### 3.3 Admin console (Vercel) and mobile (EAS)

```bash
npm run build:admin                      # must pass before deploy (CI also gates it)
npx eas build --profile production       # mobile; for push testing use the development
                                         # profile and follow §11 (GAP-06 is closed for
                                         # Android — §11.7 is the recorded run)
```

Set the production `ALLOWED_ORIGINS` / `ADMIN_APP_URL` Edge secrets to the
production admin origin — CORS falls back to localhost defaults otherwise.

### 3.4 Post-deploy smoke

1. `GET /functions/v1/health` → 200.
2. Sign in on the admin console (MFA), open overview — metrics render.
3. Buy one ticket with a Stripe test card via the mobile/web app; confirm the
   pass renders and one `stripe_events` row exists.
4. Scan the pass at a registered gate; undo it within 60 s.

### 3.5 Tenant provisioning and white-label releases

The full procedure is [`§10 Club onboarding`](#10-club-onboarding-a-clubs-go-live)
— provision, set the fee, Connect onboarding, build the white-label app,
verify. The short version:

1. `select public.provision_tenant('Club Name', 'club-slug', 'THB', 'th-TH');`
   — platform-operator only (`0054`); idempotent by slug; seeds `staff_roles`
   (`admin`, `gatekeeper`) and default `app_settings`.
2. Create the venue, zones and seats; invite the first admin
   (`admin-users`), who grants the rest.
3. Complete Stripe Connect onboarding for the club (`tenants.stripe_account_id`)
   and set `application_fee_bps` in the platform console.
4. Build the white-label app with the club's `slug` and push credentials
   (`GAP-10`); `bootstrap` sets `app_metadata.tenant_id` at sign-in.
5. Verify isolation: a second club's staff token must read 0 rows of this
   club's commerce data (pgTAP T-01…T-24 shape, run against staging).

## 4. Key rotation

All secrets rotate through Supabase secrets; none are committed.

| Secret | Rotation impact | Procedure |
|---|---|---|
| `TICKET_HMAC_KEY` | **breaking while scanning** — old passes fail after rotation | rotate between matchdays only; communicate to gate staff; verify a freshly issued pass scans before the event |
| `STRIPE_SECRET_KEY` | none in flight | `npx supabase secrets set STRIPE_SECRET_KEY=sk_test_…`; `getEnv()` refuses non-test keys — going live is this rotation |
| `STRIPE_WEBHOOK_SECRET` | webhook rejects payloads until updated | update Stripe dashboard + secret together, then replay any 401'd deliveries from the Stripe dashboard |
| `METRICS_TOKEN` | monitoring caller must be updated | set both sides, monitoring first |
| `SUPABASE_SERVICE_ROLE_KEY` | invalidates Edge auth to DB | set via dashboard/CLI; redeploy functions in the same window |
| `ALLOWED_ORIGINS` / `ADMIN_APP_URL` | CORS breaks the console if stale | update when the admin origin changes |
| **FCM V1 service-account key** (EAS credential, not a Supabase secret) | **push delivery stops** until the new key is uploaded; no app rebuild needed | Firebase console → Project settings → Service accounts → **Generate new private key**, then `npx eas-cli@latest credentials` → Android → production → *Google Service Account* → *Manage … FCM V1* → upload; send one test push to confirm (see [`PUSH.md`](PUSH.md) §2 and §10) |

Rotate immediately after: any suspected leak, offboarding of anyone with
dashboard access, and at least quarterly.

Stripe Connect (C8): each club's `stripe_account_id` is configuration, not a
secret — the platform `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` remain
the only payment secrets, and the webhook resolves the tenant from the
Connect event's `account` field.

## 5. Incident response

1. **Triage.** Check `health` (cheap + deep), then Edge logs for the failing
   function. A 429 storm is rate limiting working, not an outage.
2. **Contain.**
   - Checkout/payment issue: Stripe is authoritative — pause new sessions by
     fixing the function, never by editing order rows by hand.
   - Scan issue: gates fall back to manual code entry (REQ-21) — keep `gates`
     rows `active`, do not disable scanning mid-event.
   - Data-safety issue (suspected leak/wrong-role access): rotate the affected
     secrets (§4), then review `audit_logs`.
3. **Diagnose.** Reproduce locally with the caller's exact parameters (C4.9
   lesson: a probe that differs from production proves nothing).
4. **Verify.** Re-run the failing surface against local stack + pgTAP suite;
   the demo gate (`scripts/mvp-gate.mjs`) for anything Stripe-facing.
5. **Write up.** Postmortem in the incident doc: timeline, cause, fix, and the
   contract/finding added (reference the `F-xx`/`GAP-xx` idiom so it lands in
   `FLOW-AUDIT.md` or `REQUIREMENTS.md` §6).

Escalation: service-role data changes only via migrations/Edge Functions —
never via raw SQL against production except for a documented, reversible,
audited fix.

## 6. Common procedures

### 6.1 Local stack won't start / tests red

```bash
npx supabase stop && npx supabase start
npm run db:reset && npm run db:seed-demo
npm run db:test        # pgTAP gate (dblink password supplied by the runner)
```

The two concurrency suites need `kickoff.dblink_password`; `run-pgtap.sh`
supplies it — run pgTAP through the script, not `pg_prove` directly.

### 6.2 Types are stale after a migration

`npm run db:types` (against the local stack), commit
`packages/shared/src/database.types.ts`. Edge copies regenerate via
`node scripts/sync-edge-schemas.mjs` / `sync-error-codes.mjs` — never hand-edit.

### 6.3 A webhook delivery failed

Stripe retries automatically; `stripe_events` is the idempotency ledger (its
`id` is the primary key — replays are acknowledged, not re-fulfilled). If
processing failed the marker row is removed so Stripe's retry lands. For
manual replay use the Stripe dashboard "Resend" on the event; never re-issue
tickets by hand.

### 6.4 A scan was accepted in error

Within 60 s: `scan-undo` by the **same operator** (audited). After 60 s:
contact the supporter / treat as an incident — there is no late-undo path.

### 6.5 Refund needs a used-ticket override

Admin console → order → refund with override; the order-scoped idempotency key
makes a retry safe (same refund, not a second one). Review `audit_logs` after
every override (SECURITY §9).

### 6.6 Role change / last admin

`admin-users` writes the profile row and the JWT claim together; the console
states when the new role applies (re-login). The last-admin guard counts
admins that can act — if it refuses, promote another admin first.

### 6.7 Reminders not sent

The scheduler is `pg_cron` and secret-guarded (migration `0032`). Check the
cron job's last run, the `reminders:*` rate limit (12/60s), and the Edge logs
of `send-kickoff-reminders`.

To trigger it by hand — the fastest way to separate "the scheduler did not
fire" from "the send failed" — read the secret in the Supabase **SQL editor**:

```sql
select value from app_secrets where key = 'reminders_secret';
```

and call the function with it (the function is deployed `verify_jwt=false`):

```bash
curl -X POST "https://cvebikawynavfyfbjnzu.supabase.co/functions/v1/send-kickoff-reminders" \
  -H "x-cron-secret: <secret>" \
  -H "content-type: application/json" \
  -d '{"matchId":"<match-id>"}'
```

`{}` (or no body) uses the earliest `upcoming` match in the next 26 h.
`{"sent":N,"devices":M}` means Expo accepted N tickets; `{"sent":0,"reason":…}`
names the missing link — `no upcoming match` (pass `matchId`),
`match already started`, `no ticket holders` (no `valid` ticket rows),
`no registered devices` (no `device_tokens` rows). A `401 Invalid reminder
scheduler secret` is the header, not the function. Full walkthrough:
[`PUSH.md`](PUSH.md) §7.

### 6.8 A fan asks for their data, or to be erased

Both are the fan's own action, not an admin's — and both are the schedule in
[`PRIVACY.md`](PRIVACY.md), not ad-hoc rows deleted by hand:

- **Export (subject access):** the fan signs in and calls `export-user` with
  no body — one JSON document with their profile, orders, tickets, holds and
  device tokens across every club they touch. Support may export on a fan's
  behalf (admin only); it writes an `account.export` audit row.
- **Erasure:** the fan calls `delete-account` (or support with an admin JWT
  and the fan's `userId`). It scrubs the profile (the identity is removed,
  the row stays), erases the fan's device tokens and holds, voids their
  still-valid passes, and RETAINs the financial and gate records with their
  identity scrubbed. The in-app privacy notice promises exactly this.

A fan account can be re-created later; the scrubbed identity rows of orders
and scans are pseudonyms by then and are not restored.

### 6.9 Matchday: the clock, postponement, and the result

**The clock is automatic.** `xclub-match-clock` runs every minute
(`record_match_clock()` in `0058`). It flips `upcoming → live` at kickoff,
`upcoming/live → completed` at kickoff + 2 hours, and writes four bells for
the console: kick-off, half-time (T+45), 15 minutes left (T+90), full-time
(T+120). Each moment is unique per match, so a re-run is a no-op. Use
`select * from cron.job where jobname = 'xclub-match-clock';` to confirm the
job, and `select public.record_match_clock();` to run a pass by hand.

**No score is ever automatic.** A completed fixture without scores shows as
**Needs result** in the matches list, stays out of the fan Results list, and
keeps its full-time bell unread. Enter the result on the fixture page —
one save writes both scores and `completed` (`admin_set_match_result`).

**Postpone or cancel** from the fixture page (reason required, audited):

- **Postpone** stops sales, keeps sold tickets valid, and pauses the clock.
  Setting a new kickoff (reschedule) returns the fixture to `upcoming` and
  re-arms the clock.
- **Cancel** stops sales and **voids every valid ticket**. It does **not**
  move money: the orders page shows the paid orders that need the normal
  refund flow. Cancellation is terminal except for an audited **Restore**
  (mistake reversal) — restored tickets stay void and must be reissued.

Sales stop at kickoff in the database (`stripe-checkout` returns
`match_started`); a fixture whose stored status lags is still refused.

**The venue owns the physical ground.** Set up the venue first: zones (with a
default price), their generated seats, and gates. The home ground is the one
venue marked **Home** and is preselected for home fixtures; away grounds are
chosen from the dropdown at fixture creation, or added inline with **Add away
venue**. Creating a fixture clones the venue layout (zones, seats, prices and
gates) in one transaction — edit the venue only when you mean future fixtures,
because a played fixture keeps its own copy.

**Gates are physical and reusable.** A gate is never recreated for a match:
attach the same turnstile to the new fixture on the Gates page. Past
assignments stay as history and are not selectable; the scanner shows the
fixture the gate is admitting now, not the earliest date it ever served.

**A gate serves one stand of one ground.** Name the stand on the Gates page —
*Whole ground* is only for an entrance that admits every stand. A pass for a
different stand is refused as **Wrong stand** and the pass stays valid, so the
fan can walk to the right gate. A gate cannot be assigned to a fixture at
another venue, and once it has any assignment its venue is fixed: create a new
gate rather than moving a turnstile with history.

**Seating locks at kickoff.** Once a fixture has started or been closed,
admin writes to zones, prices and seats are refused by trigger
(`0062_lock_seating_after_kickoff`), and the fixture page hides the controls.
Reschedule the fixture to a future kick-off (or restore a postponed one) to
edit its inventory again. The trusted seed/migration path is unaffected.

**Results are one click.** A completed fixture without a score is flagged
**Needs result** on the matches list; **Enter result** opens the score form
directly. Saving writes both scores and `completed` in one audited call.

## 7. Backup and recovery

- **Data:** Supabase managed Postgres — verify the project's backup schedule in
  the dashboard; before risky migrations take a manual backup
  (dashboard → Database → Backups) and keep the `db push` output.
- **Restore drill (quarterly):** restore the latest backup into a scratch
  project, run `npm run db:test`-equivalent sanity checks, confirm
  `profiles`/`orders`/`tickets` counts match, then discard.
- **Code:** everything is in git; the repo (plus `supabase/migrations`) is the
  full recovery source. Secrets are **not** in git — they live in Supabase,
  Vercel, EAS and CI secret stores; keep an offline record of *where* each
  secret lives (not its value) per `SECURITY.md` §1.

## 8. Deployment readiness checklist (before a live event)

- [ ] `health` 200 (cheap) and deep check with metrics token.
- [ ] Migrations applied; no pending `supabase/migrations`.
- [ ] `ALLOWED_ORIGINS`/`ADMIN_APP_URL` point at the production admin origin.
- [ ] Stripe webhook endpoint shows recent successful deliveries.
- [ ] Gates registered and `active` for the fixture; each gate names its stand
      (or **Whole ground**), and gate staff can sign in.
- [ ] `TICKET_HMAC_KEY` unchanged since the passes were issued (or rotated
      *before* issuance, never between issue and gate).
- [ ] Rate-limit budgets reviewed (`SECURITY.md` §7) — raise `scan` if the
      gate expects > 240 scans/min (code change required, not a secret).
- [ ] `metrics` shows zero order-status drift and normal `holds.conflicts`.
- [ ] PostHog key set (or explicitly disabled) on the console.
- [ ] Push ready: the FCM V1 key is present in EAS credentials, and the demo
      fan has at least one `device_tokens` row — send one manual reminder
      (§6.7) and confirm it reaches the tray before matchday.

## 9. Tenant offboarding (a club's exit)

The club's exit is the procedure in [`PRIVACY.md`](PRIVACY.md): an export,
the money hand-back, then an erase. **Do not skip the money step** — the
platform must not hold a club's money on its own connected account with no
agreed way to hand it back (ADR-003 §6, GAP-09).

Everything below runs as the **service role** (`serviceClient`), never as a
club member: `mark_tenant_offboarded()` and `erase_tenant()` refuse every
other role, and the console has no button for either.

### 9.1 The money hand-back (a human signs this off)

The platform operator confirms, in order:

- [ ] No open orders for the club: `select count(*) from orders where tenant_id = '<id>' and status in ('pending','paid')` — zero (refund anything still live first).
- [ ] The club's connected account balance is settled to zero in Stripe.
- [ ] The connected account is **disconnected** in Stripe (the club's own
      account, not the platform's).
- [ ] The payout reference is written in the offboarding ticket — the
      erase's `tenant.erased` audit row is the machine-readable record; the
      payout reference is the human one.

Only then mark the sign-off:

```sql
select public.mark_tenant_offboarded('<tenant uuid>');  -- audited
```

The mark is `tenants.offboarded_at` — `erase_tenant()` refuses until it is
set. An unknown club raises (`P0002`); an un-offboarded club raises
(`P0001`).

### 9.2 The export

```sql
select public.export_tenant('<tenant uuid>');  -- one JSON archive
```

The archive is every tenant-scoped table for the club plus its own row, keyed
by table name with per-table counts; an unknown club raises rather than
exporting a silent empty archive. Each export writes a `tenant.export` audit
row. Keep the archive with the offboarding ticket — it is what the club
signed up for, and what a regulator's export request answers.

### 9.3 The erase

```sql
select public.erase_tenant('<tenant uuid>');  -- refused until 9.1 is done
```

It purges every tenant-scoped row (children first), keeps the `tenants` row
as the tombstone — `erased_at` set, Connect account and branding gone, name
and slug kept — and writes a `tenant.erased` audit row that survives the
purge. A second run is a no-op that adds no second tombstone.

Verify after the erase:

```sql
select slug, erased_at, stripe_account_id, primary_color, logo_url
from tenants where id = '<tenant uuid>';
-- 'exit-fc', <timestamp>, null, '', null
select count(*) from audit_logs where action = 'tenant.erased'
  and entity_id = '<tenant uuid>';   -- 1
```

The remaining `tenants` row is the tombstone — the club existed and the
erase happened — and is kept on purpose: it is the record, not the data.

## 10. Club onboarding (a club's go-live)

This is the `GAP-10` checklist: one club per app build means every club
repeats these steps once. The platform console does the writes; each one is
audited (`tenant.status_changed`, `tenant.fee_changed`, `tenant.onboarded`),
and every guarded write refuses any caller that is not a platform operator
or the service role (`0054`).

**Prerequisites**

- [ ] The Stripe key is test-mode (`sk_test_…`) — `getEnv()` refuses anything
      else (D-08). Going live is a key rotation (§4), not a code change.
- [ ] You hold the platform authority:
      `select public.is_platform_admin();` → `true` for your account, or you
      are in a psql session as the service role (`set local role service_role;`).

### 10.1 Grant the platform authority (once per operator)

```sql
-- As the service role. Writes both projections together: the membership row
-- and the `app_metadata.platform` claim the console proxy and the Edge
-- guards read. `false` revokes exactly those two.
select public.set_platform_admin('<auth user uuid>', true);
```

Nothing else may write either projection — the table has RLS and no policy,
and `set_platform_admin()` is service-role only.

### 10.2 Provision the club

Platform console → **Platform** → *Provision a club* (name, slug, currency),
or directly as an operator:

```sql
select public.provision_tenant('South London FC', 'south-london-fc',
                               'GBP', 'en-GB', 'Europe/London');
```

- [ ] The **slug is permanent** — it is what the white-label build binds to
      at sign-in. Lowercase, single hyphens (the database refuses anything
      else).
- [ ] The club's currency, locale and time zone are set (they drive money
      formatting and every kickoff time in both apps — C8.2).

### 10.3 Staff the club

Sign in as the first club admin (invite via `admin-users`), then create the
venue, zones and seats and invite the rest. This is club authority
(`staff_members`), never platform authority — the two do not substitute for
each other.

### 10.4 Set the platform fee

Platform console → the club's row → fee in **basis points** (0–10000 = 0–100%).
The database bounds and audits it (`tenant.fee_changed`); the order snapshots
it at checkout, so changing it never re-prices a sale already made.

### 10.5 Connect the club's Stripe account

Platform console → the club's row → country → **Onboard**. The function
creates the Express account once (`tenants.stripe_account_id`), audits the
onboarding and returns Stripe's hosted link; complete the form in the tab it
opens. Clicking again **resumes** the same account — it never creates a
second one.

- [ ] The row shows **Account created** as soon as the link is issued.
      Stripe *activates* the account when the owner submits the hosted form
      — confirm the activation in the Stripe dashboard (this console records
      the account id, not Stripe's activation state).

### 10.6 Build the white-label app

Set the build-time configuration and push credentials (per-club EAS project,
bundle id — `GAP-10`):

```
EXPO_PUBLIC_CLUB_SLUG=south-london-fc
```

At sign-in the app calls `bootstrap`, which writes `app_metadata.tenant_id`
for the session. Verify the binding:

```sql
select raw_app_meta_data ->> 'tenant_id'
from auth.users where email = '<fan or operator email>';
-- <the club's uuid>
```

### 10.7 Verify before announcing

- [ ] The fan app shows **this** club's catalogue after sign-in (not the
      deployment's default club).
- [ ] A test checkout settles on the club's connected account — the order's
      fee matches §10.4 and `stripe-webhook` resolves the club from the
      event's account.
- [ ] The club's admin is refused the platform console: `/dashboard/platform`
      redirects with `error=not-platform`.
- [ ] Isolation holds: the second club's staff token reads 0 rows of this
      club's commerce data (the pgTAP T-01…T-24 shape, run against staging).

### 10.8 Suspending and restoring

Platform console → the club's row → **Suspend** (confirmed) / **Restore**.

Suspension keeps every row; `current_tenant()` resolves no tenant for the
club's staff and fans, so both apps lose access. Restoring reverses it. Both
directions are audited, and the registry shows suspended clubs precisely so
one can be restored.

## 11. Hardware push proof (GAP-06)

Every layer below the device is contract-tested (`scripts/tests/push.test.mjs`,
PUSH-1…PUSH-9). What this procedure proves is the round trip a simulator
cannot: **build → install → permission → token → delivery**. Run it once per
platform, and again whenever the Firebase project, the app package or the
EAS project changes.

The checklist version is below; the full step-by-step — every Firebase click,
the exact `eas credentials` menu path, the SQL recipes and the send/receipt
`curl`s — is [`docs/PUSH.md`](PUSH.md).

### 11.1 Prerequisites

- [ ] An EAS account with access to the project; `EAS_PROJECT_ID` is set in
      `apps/mobile/eas.json` under `build.<profile>.env`. It must live there,
      not only in `.env`: `apps/mobile/.env` is gitignored, and EAS uploads
      the project *respecting* `.gitignore`, so a value that exists only in
      `.env` is absent on the build server — the APK then bakes
      `extra.eas.projectId: undefined` and the app reports
      *"EAS_PROJECT_ID is missing"*.
- [ ] `apps/mobile/google-services.json` is committed and its
      `client_info.android_client_info.package_name` matches
      `android.package` (`app.kickoff.fan`). A mismatch makes Firebase return
      `403 PERMISSION_DENIED` and no token is ever issued.
- [ ] The **FCM V1 service-account key** is uploaded to EAS — this is the
      server side, and it is what actually delivers the notification. In
      Firebase: Project settings → Service accounts → **Generate new private
      key**; then `npx eas-cli@latest credentials` → Android → production →
      *Google Service Account* → *Manage … FCM V1* → *Set up …* → upload
      ([`PUSH.md`](PUSH.md) §2 has every screen). The downloaded
      `*firebase-adminsdk*.json` is a real secret: it is gitignored and must
      never be committed.
- [ ] A **physical** device. Expo Go cannot receive push since SDK 53, and
      simulators/emulators cannot register.

### 11.2 Build the development client

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```

The `development` profile builds a dev client (`expo-dev-client`,
`distribution: internal`). Internally distributed Android artifacts must be
APKs, which `PUSH-2b` pins — an `.aab` cannot be installed from the build URL.

iOS is the same command with `--platform ios`, plus an APNs key uploaded to
EAS instead of FCM.

### 11.3 Install and register the device

1. Open the build's artifact URL **on the phone** and install it.
2. Launch the **installed app**, not Expo Go. The Settings screen shows the
   refusal reason when the runtime is wrong, so a wrong launch is caught here
   rather than at the token call.
3. Sign in with the demo fan account.
4. Settings → **Match reminders**: grant the OS permission when prompted.
   `registerPushToken()` then calls `getExpoPushTokenAsync({ projectId })` and
   `POST /devices`, which upserts a row in **`device_tokens`** for that fan.
   The screen shows only the switch — it never displays the token — so verify
   in the Supabase **SQL editor**:
   `select token, platform, created_at from device_tokens order by created_at desc limit 5;`
   Record the first ~10 characters only; a full `ExponentPushToken` can send to
   the device.

### 11.4 Deliver the test push

Two different things get called "testing push"; run both, because they prove
different links.

**A. Direct push — proves the token and the FCM key.** Background the app (or
swipe it out of recents) first.

- [ ] `https://expo.dev/notifications` → paste the token → send, **or**

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H 'Content-Type: application/json' \
  -d '{"to":"ExponentPushToken[…your-token-here…]","title":"KickOff","body":"Hardware push proof","sound":"default"}'
```

Keep the returned ticket `id` and check the receipt:

```bash
curl -X POST https://exp.host/--/api/v2/push/getReceipts \
  -H 'Content-Type: application/json' \
  -d '{"ids":["<ticket-id>"]}'
```

**B. The reminder path — proves the ticket query and the device lookup.** This
is the function `pg_cron` actually calls; a successful direct push does **not**
prove it. §6.7 has the manual trigger
(`x-cron-secret` + `{"matchId":"…"}`), and [`PUSH.md`](PUSH.md) §7 walks
through it.

### 11.5 What green looks like

All five, observed once:

- [ ] The build finishes and its artifact installs on the device.
- [ ] The app runs as the installed dev client (Settings shows no
      push-unavailable reason).
- [ ] The OS permission dialog appears and is granted.
- [ ] A push token is stored in **`device_tokens`** (seen in the SQL editor).
- [ ] The test notification arrives **with the app backgrounded or swiped out
      of recents**, in the notification tray.
- [ ] The manual reminder returns `{"sent":N,"devices":M}` with N ≥ 1.

Record the evidence in the release ticket: build URL, device model and OS
version, token prefix, and the push receipt from `expo.dev/notifications`.
That evidence — not this procedure — is what closes `GAP-06`. Android is
closed on the run in §11.7; iOS still needs its own.

### 11.6 When it fails

| Symptom | Cause | Fix |
|---|---|---|
| Settings says *EAS_PROJECT_ID is missing* | The APK was built without the profile env | Rebuild after §11.1's first box |
| Settings says *Expo Go cannot receive push* | Launched in Expo Go | Install and open the dev-client APK |
| Settings says *needs a physical device* | Simulator/emulator | Use real hardware |
| Native log: *Unable to get Firebase Messaging instance* | `googleServicesFile` unwired, or the file's package ≠ `android.package` | §11.1 boxes 2 |
| Token obtained, no notification | FCM V1 key missing, or the API key in `google-services.json` is restricted | Upload the key; allow **FCM Registration API** and **Firebase Installations API** in Google Cloud, and use the Play *App signing* SHA-1, not the upload key's |
| Notification only while the app is open | Background delivery never configured | Check the channel and the FCM key above |

### 11.7 Recorded run — 2026-11-19

The first completed hardware proof, against the hosted project
(`cvebikawynavfyfbjnzu`) with a `development` build installed from its EAS
artifact:

| Field | Value |
|---|---|
| Device | Xiaomi Pad 6 |
| OS | Android 14 |
| Token | `ExponentPushToken[-u895ZPCd6…` — prefix only; the full token can send to the device |
| Trigger | `POST /functions/v1/send-kickoff-reminders` with `{"matchId":"m-cmi"}` → `{"ok":true,"data":{"sent":1,"matchId":"m-cmi","devices":1}}` |
| Notification | *"Matchday is coming — KickOff vs Chiang Mai FC · Sat, 21 Nov, 19:30 at KickOff …"*, in the tray |
| App state | swiped out of recents, so the process was not running — the notification came from FCM through the OS, not from the JS runtime |
| Evidence | `docs/evidence/push-hardware-xiaomi-pad-6-2026-11-19.jpg` |

This closes `GAP-06` for Android. iOS uses the same procedure with an APNs key
instead of FCM and has not been run yet; the gap row says so rather than
implying both platforms.
