# RUNBOOK — KickOff

Operational procedures for the people who run KickOff in production: deploy,
migrate, rotate keys, respond to incidents, and recover from failure. Every
command is written to be run from the repository root unless stated otherwise.

- **Status:** living document · **Owner:** engineering
- **Last verified:** 2026-11-14
- **Related:** [`SECURITY.md`](SECURITY.md) (controls + secret inventory) ·
  [`TESTING.md`](TESTING.md) (verification layers) ·
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
  migration — add the next one (`0045…` is the next free number).
- Apply migrations **before** deploying functions that depend on them.
- After any schema change regenerate the shared types:
  `npm run db:types` (local) and commit the updated
  `packages/shared/src/database.types.ts`.
- Verify locally first: `npm run db:reset && npm run db:test` (pgTAP).

### 3.3 Admin console (Vercel) and mobile (EAS)

```bash
npm run build:admin                      # must pass before deploy (CI also gates it)
npx eas build --profile production       # mobile; development profile for push testing (GAP-06)
```

Set the production `ALLOWED_ORIGINS` / `ADMIN_APP_URL` Edge secrets to the
production admin origin — CORS falls back to localhost defaults otherwise.

### 3.4 Post-deploy smoke

1. `GET /functions/v1/health` → 200.
2. Sign in on the admin console (MFA), open overview — metrics render.
3. Buy one ticket with a Stripe test card via the mobile/web app; confirm the
   pass renders and one `stripe_events` row exists.
4. Scan the pass at a registered gate; undo it within 60 s.

### 3.5 Tenant provisioning and white-label releases (planned — C6–C9)

`provision_tenant()` and the `tenants` row exist (migration `0040`), and it
seeds the per-club `staff_roles` vocabulary (`0041`); default `app_settings`
seeding arrives in `0042`. The full procedure lands with the C6–C9 cycles and
will be completed here before the first second-club deployment.

1. `select provision_tenant('Club Name', 'club-slug', 'THB', 'th-TH');`
   — idempotent by slug; seeds `staff_roles` (`admin`, `gatekeeper`) and default
   `app_settings` once `0042` lands.
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
- [ ] Gates registered and `active` for the fixture; gate staff can sign in.
- [ ] `TICKET_HMAC_KEY` unchanged since the passes were issued (or rotated
      *before* issuance, never between issue and gate).
- [ ] Rate-limit budgets reviewed (`SECURITY.md` §7) — raise `scan` if the
      gate expects > 240 scans/min (code change required, not a secret).
- [ ] `metrics` shows zero order-status drift and normal `holds.conflicts`.
- [ ] PostHog key set (or explicitly disabled) on the console.
