# KickOff — matchday platform

**Your digital ticket to match day.**

KickOff is the operations and supporter platform for a single football club:
a customer mobile app, a staff admin console, and the Supabase + Stripe backend
they share. Fixtures, seating, payments, passes and gate admissions are real —
nothing runs on a mock data layer.

- **Mobile app** (Expo / React Native) — fixtures and news, exact-seat booking,
  Stripe Checkout, digital QR match passes, order history and PDF receipts,
  profile, settings and push notifications.
- **Admin console** (Next.js 16) — fixtures and seating inventory, gates,
  scanner, orders, refunds, CSV export, news, users, settings and TOTP.
- **Backend** (Supabase) — Postgres with row-level security, 15 Edge Functions,
  Stripe webhooks, signed QR passes, audit logs, scheduled reminders and a
  token-guarded metrics endpoint.

---

## Architecture

```text
apps/mobile  ──┐
               ├── @kickoff/shared (types, schemas, formatting, theme, QR contract)
apps/admin   ──┘
               │
               ▼
        Supabase Postgres (RLS) + Edge Functions ── Stripe (test mode)
               │                                   └─ Expo Push Service
               └─ storage: receipts (private), news-images (public)
```

Clients talk to Postgres through RLS-scoped reads. Anything that moves money,
issues a pass, or admits a supporter at a gate runs in an Edge Function or a
`security definer` SQL function — never in the browser or app bundle.

---

## Feature matrix

| Area | Mobile | Admin |
|---|---|---|
| Accounts | Sign up, sign in, reset password, profile edit, delete account | Sign in, TOTP MFA, user roles, settings |
| Fixtures | Home feed, match detail, zones & availability | Create/edit/delete fixtures, zones, rows, seats and prices |
| Commerce | Exact seat selection, 10-minute holds, Stripe Checkout, order history | Orders, filters, CSV export, refunds, receipt lookup |
| Passes | Signed QR pass, payment-confirmation screen | Pass registry, scan history, undo within 60s |
| Gates | — | Gate registry, per-fixture assignment, camera + manual scan, offline queue |
| Content | News feed and article pages, legal pages | Publish/edit news |
| Notifications | Expo push opt-in, kickoff reminders | — |
| Ops | — | Revenue/scan snapshot, gate log, club settings |

---

## Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 58, React Native 0.88, React 19, Expo Router, TanStack Query |
| Admin | Next.js 16.4 (App Router), Tailwind 4, TanStack Query |
| Shared | TypeScript, Zod schemas and DTO mappers |
| Backend | Supabase Postgres 17, RLS, Edge Functions (Deno 2), Storage |
| Payments | Stripe Hosted Checkout — **test mode**, card only, THB |
| Push | Expo Push Service + `pg_cron` reminders |
| Quality | Vitest, `node:test`, pgTAP, Deno test, Playwright, Maestro |

Prerequisites: **Node 22 LTS** (`.nvmrc`, `nvm use`), npm 10+, Docker for the
local Supabase stack (or a hosted Supabase project), and the Supabase CLI
(`npx supabase`). Stripe CLI is optional, only for forwarding webhooks locally.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure the environment

Copy the templates and fill in real values. Secrets never go in client bundles.

| File | Purpose |
|---|---|
| `.env` | Root: Supabase URL/keys, Stripe **test** keys, `TICKET_HMAC_KEY`, `METRICS_TOKEN`, demo credentials |
| `apps/admin/.env.local` | `NEXT_PUBLIC_SUPABASE_*`, optional demo login, optional PostHog |
| `apps/mobile/.env` | `EXPO_PUBLIC_SUPABASE_*`, `EXPO_PUBLIC_FUNCTIONS_URL`, optional demo login and PostHog |
| `supabase/.env` | Edge Function secrets (service role, Stripe, HMAC, metrics token) — template: `supabase/.env.example` |

Guardrails: `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` must never
appear in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`. Edge Functions refuse any Stripe key
that does not start with `sk_test_` — this build is Stripe test mode only.

### 3. Database

Local (Docker):

```bash
npm run db:start      # start the local Supabase stack
npm run db:reset      # apply migrations + seed
npm run db:seed-demo  # demo accounts, fixtures, orders and passes
npm run db:types      # regenerate packages/shared/src/database.types.ts
```

Hosted project: link it (`npx supabase link --project-ref <ref>`), push
migrations (`npx supabase db push`), then run `npm run db:seed-demo`.

`db:reset` also loads `supabase/seed.sql` (gates and baseline content), while
`db:seed-demo` is the idempotent seeder used for both local and hosted demos.

### 4. Edge Functions

```bash
npm run functions:serve    # local serve
npm run functions:check    # deno check every function
```

Deploy (the import map is required when Docker is unavailable):

```bash
npx supabase functions deploy \
  --import-map supabase/functions/deno.json \
  --yes --remote=<project-ref>
```

Required function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`TICKET_HMAC_KEY`, `METRICS_TOKEN`, `ADMIN_APP_URL`, `MOBILE_DEEP_LINK`.
Set them with `npx supabase secrets set --env-file supabase/.env` before
deploying. Forward Stripe events locally with
`stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook`.

### 5. Run

```bash
npm run admin        # http://localhost:3000
npm run mobile       # Expo — press w for web, or scan with Expo Go
npm run mobile:web   # mobile app directly in a browser
```

#### Run on a phone over the LAN

Same Wi-Fi, no tunnel — the Expo dev server binds to your machine's LAN IP:

```bash
npm run mobile:lan   # Expo bound to the LAN; scan the QR with Expo Go
npm run admin        # admin dev server (add --experimental-https for tablets)
```

Open the firewall for the two dev ports once:

```bash
sudo ufw allow 8081/tcp   # Metro bundler — Expo Go on a phone
sudo ufw allow 3000/tcp   # admin dev server — gate-scanner tablets (HTTPS)
```

Notes:

- The phone and the machine must be on the same network; client-isolated
  Wi-Fi (some school/corporate networks) blocks this — fall back to
  `npx expo start --tunnel` from `apps/mobile`.
- Admin over LAN uses `cd apps/admin && npx next dev --experimental-https`
  (self-signed cert; accept the browser warning once). The LAN hostname is
  allowlisted in `apps/admin/next.config.ts` (`allowedDevOrigins`) —
  hostname only, no `https://` prefix.
- LAN config is dev-only; production builds are unaffected.

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Admin (web) | `admin@kickoff.app` | `kickoffadmin` |
| Fan (mobile) | `demoFan@kickoff.test` | `demo@Password` |

The mobile login also shows **Continue with demo fan account** when
`EXPO_PUBLIC_DEMO_EMAIL` / `EXPO_PUBLIC_DEMO_PASSWORD` are set. The demo fan
owns one valid pass and one used pass. (Without env overrides, `seed-demo`
falls back to `fan@kickoff.app` / `kickoffdemo`.)

---

## Demo script (5 minutes)

1. **Admin** — sign in, **Matches & seating** → **New fixture**. The fixture
   opens its seating page; add a zone with rows, seats and a price.
2. **Fan** — sign in on mobile, open the next fixture, choose a stand and exact
   seats. The seats are held for **10 minutes** while you check out.
3. **Fan** — **Continue** → **Checkout** → **Pay**. Stripe Checkout opens in a
   browser; use the test card `4242 4242 4242 4242`, any future expiry and CVC.
   The webhook issues the pass and the app shows the signed QR.
4. **Admin** — **Gate scan**: pick the gate assigned to that fixture, then scan
   the pass or press **Validate demo pass now**. A pass is only accepted inside
   **kick-off −2h … +2h**; outside that window the gate answers “Rejected”.
5. **Admin** — a second scan returns **Already scanned**. An accepted scan can
   be undone for **60 seconds** from the result panel.
6. **Admin** — **Orders & passes**: filter, **Export CSV**, or **Refund** a paid
   order (used passes require the explicit override on the order page).
7. **Fan** — **Orders** → open the order → download/share the **PDF receipt**.

Sales close **15 minutes before kick-off**; unpaid orders expire after
**15 minutes** and release their seats.

---

## Repository structure

```text
.
├── apps/
│   ├── mobile/                  # Expo + React Native + Expo Router
│   │   └── src/
│   │       ├── app/             # Routes: auth, tabs, match, seats, checkout,
│   │       │                    #   ticket, orders, news, settings, legal
│   │       ├── components/      # UI kit, match cards, ticket cards
│   │       └── lib/             # Supabase client, queries, auth, notifications,
│   │                            #   receipts, secure storage, analytics
│   └── admin/                   # Next.js 16 + Tailwind 4
│       ├── e2e/                 # Playwright: auth + operations walkthrough
│       └── src/
│           ├── app/             # login, MFA, dashboard/*
│           ├── components/      # shell, forms, modal, badges, toasts
│           └── lib/             # Supabase clients, queries, scan API,
│                                #   offline queue, CSV export, analytics
├── packages/
│   └── shared/                  # Zod schemas, DTOs/mappers, DB types, money and
│                                #   date formatting, theme tokens, QR contract,
│                                #   English string table, Bangkok greeting
├── supabase/
│   ├── migrations/              # 33 migrations: schema, RLS, RPCs, cron, seeds
│   ├── functions/               # 15 Edge Functions + _shared helpers
│   ├── tests/                   # pgTAP suites (RLS, expiry, concurrency)
│   └── seed.sql
├── scripts/                     # seed-demo, pgTAP runner, MVP gate, tests
├── docs/                        # BRAND, SECURITY, TESTING, BASELINE
├── maestro/flows/               # buy/QR mobile smoke
├── PLAN.md                      # delivery plan and decisions (SSOT)
└── README.md
```

---

## Mobile routes

| Route | Screen |
|---|---|
| `/welcome` | Branded onboarding |
| `/login`, `/register` | Sign in, create account |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/(tabs)` | Home: next match, fixtures, news, results |
| `/(tabs)/tickets` | Active and past passes |
| `/(tabs)/profile` | Supporter account |
| `/match/[id]` | Match detail, zones and availability |
| `/seats/[matchId]` | Exact seat grid with live availability |
| `/checkout` | Hold summary, Stripe payment |
| `/ticket/[id]` | Signed QR pass |
| `/orders`, `/orders/[id]` | Order history and PDF receipt |
| `/news/[id]` | Article |
| `/profile/edit` | Edit name and phone |
| `/settings` | Notifications, language, legal, sign out, delete account |
| `/legal/[doc]` | Terms, privacy and refund policy |

## Admin routes

| Route | Screen |
|---|---|
| `/login`, `/login/mfa` | Staff sign-in and TOTP challenge |
| `/dashboard` | Overview: revenue, passes sold, scan pulse, recent orders |
| `/dashboard/matches` | Fixture list, create/edit/delete |
| `/dashboard/matches/[id]` | Zones, prices, rows and seats |
| `/dashboard/gates` | Gate registry and per-fixture assignment |
| `/dashboard/scan` | Camera scanner, manual payload, demo pass, offline queue |
| `/dashboard/tickets` | Orders, filters, CSV export, refunds |
| `/dashboard/tickets/[orderId]` | Seats, payment reference, refund and receipt |
| `/dashboard/news` | Article publishing and editing |
| `/dashboard/users` | Roles, accounts |
| `/dashboard/settings`, `/dashboard/settings/mfa` | Club settings, security |

---

## How it works

**Booking and holds.** `create_hold` reserves seats for 10 minutes under a
unique-active-seat index; expired holds are released automatically.
`create_order_from_hold` turns a hold into a pending order (15-minute TTL) and
locks sales 15 minutes before kick-off.

**Payments.** `stripe-checkout` calculates the amount from the database (never
from the client), creates a Hosted Checkout session in THB with **card only**,
and returns the URL. `stripe-webhook` verifies `stripe-signature`, records each
event idempotently in `stripe_events`, and issues tickets exactly once.
Refunds run through `refund-order` (admin JWT required, audit-logged, used
passes need an explicit override).

**Passes and gates.** `ticket-qr` signs `KICKOFF-V2:{…}` with HMAC over
`ticket|match|order|nonce`, so a modified or stale payload is rejected.
`scan-ticket` checks the gate's assigned fixture, the pass status, and the
**−2h/+2h** window, then marks the pass used and writes a `scan_events` row.
`Idempotency-Key` makes offline replays safe; `scan-undo` restores a pass within
60 seconds. `scan-demo` issues a real signed pass for staff demonstrations.

**Accounts, push and audit.** Supabase Auth with `app_metadata.role` claims
drives admin access (`is_admin()` in RLS). Device tokens power Expo push; two
hourly `pg_cron` jobs send the 24-hour and 2-hour kickoff reminders
(`send-kickoff-reminders`, guarded by a scheduler secret). Account deletion,
refunds and settings changes are written to `audit_logs`.

**Metrics.** `GET /functions/v1/metrics` returns order totals, 24h scan results,
failed scans and hold contention. It requires `x-metrics-token: $METRICS_TOKEN`
(constant-time compare), so it is one of the few endpoints that bypasses the
platform JWT check (`verify_jwt = false` in `supabase/config.toml`).

**Analytics (optional).** PostHog adapters exist for both apps; they are a
no-op in development and whenever the project key is unset.

## Security

Row-level security is enabled on every table: supporters read only their own
orders, passes and holds; catalogue data is public-read/admin-write; scan
events, audit logs and Stripe events are admin-only; `rate_limits` is
service-role only. Edge Functions validate JWTs, rate-limit checkout, scanning,
undo, device registration and reminders, and fail closed on errors. Full detail:
[`docs/SECURITY.md`](docs/SECURITY.md).

---

## Testing and quality gates

```bash
npm test                         # Vitest (shared) + admin + repo script tests
npm run check                    # typecheck all workspaces + lint
bash scripts/run-pgtap.sh        # RLS, expiry, scan concurrency
npm run functions:check          # deno check every Edge Function
cd supabase/functions && deno test --allow-env --allow-net tests/
npm run test:e2e --workspace @kickoff/admin   # Playwright auth + ops walkthrough
maestro test maestro/flows/buy-ticket.yaml    # mobile buy/QR smoke
node scripts/mvp-gate.mjs        # 15-step end-to-end launch gate
npm run check:no-mocks           # mock layer cannot return
npm run build:admin              # production build (/dashboard is dynamic)
```

Commands, environment variables and skip conditions are documented in
[`docs/TESTING.md`](docs/TESTING.md). CI runs the deterministic layers on every
push and the Playwright suites when E2E secrets are configured.

## Brand and design

Club **KickOff**, stadium **KickOff Arena**, deep link `kickoff://`. Palette:
pitch green `#0B6B3A`, trophy gold `#F4C430`, night `#07130D`, ink `#0F172A`.
Barlow Condensed for display, Inter for body. `packages/shared/src/theme.ts` is
the single source of truth; see [`docs/BRAND.md`](docs/BRAND.md).

## Post-MVP

Thai localisation (the typed English table ships now; `P11-08`–`P11-11` are
deferred past v1), PromptPay alongside cards, wallet passes, merch and chat, live
Stripe mode, and store deployment via EAS.

## Documentation

- [`PLAN.md`](PLAN.md) — delivery plan, decisions and phase status (SSOT)
- [`docs/SECURITY.md`](docs/SECURITY.md) — RLS matrix, secrets, payments, QR
- [`docs/TESTING.md`](docs/TESTING.md) — every test layer and command
- [`docs/BRAND.md`](docs/BRAND.md) — brand tokens and usage
- [`docs/BASELINE.md`](docs/BASELINE.md) — recorded baseline environment
