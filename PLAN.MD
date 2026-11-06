# PLAN.md

**Project:** XClub Ticketing Platform — monorepo (`apps/admin`, `apps/mobile`, `packages/shared`, new `apps/api`)
**Role of this file:** single source of truth for the Editor agent. Every task is **one file = one commit**.
**Status:** FINAL — incorporates v1 base plan + v3 addenda (final 10 files) + v4 addenda (`layout.tsx`).

---

## §0 Editor Guardrails (non-negotiable)

1. One task = one file = one commit. Never touch two files in a single task.
2. After each task: `pnpm -w typecheck && pnpm -w lint`. Broken → fix within the same file; if it needs a different file, stop and escalate.
3. Never rename an exported symbol without a task that lists every call site.
4. Never add a new dependency except in `P1-15`, `P1-16`, `P3-01`.
5. All server responses use the `ApiResponse<T>` envelope. No ad-hoc error shapes.
6. No `any` in new code. No `console.log` in server code — use the logger from `P4-02`.
7. Money is always `*Satang: number` (integer). Never floats. Dates are ISO 8601 UTC strings at the wire boundary.
8. Definition of Done (DoD) for **every** task: builds, typechecks, lints, plus the task's own acceptance line passes.
9. **`apps/admin/src/app/layout.tsx` MUST stay a Server Component** — no `"use client"` ever. `metadata` export only works from SCs.
10. **Never modify the `<html className={...}>` string** in `apps/admin/src/app/layout.tsx` — it binds `--font-inter` and `--font-barlow` CSS variables that `.display`, `.font-sans`, and
every admin heading depend on.

---

## §A Current State Assessment

### A.1 Built (draft is functional)

**`packages/shared`**
- `types.ts` — full domain model: `Profile`, `Role`, `Match`, `MatchStatus`, `Zone`, `Seat`, `SeatStatus`, `Order`, `OrderSeat`, `OrderStatus`, `Ticket`, `TicketStatus`, `NewsItem`,
`ScanResult`, `DemoSession`, `BookingSelection`.
- `theme.ts` — palette tokens + display formatters (`formatTHB`, `formatMatchDate/Time`, `formatFullDate`, `formatShortDate`).
- `qr.ts` — unsigned v1 `MockQrPayload` + `buildTicketQr` / `decodeTicketQr` / `ticketFromQr`. **Not cryptographically safe.**
- `mock.ts` — `demoAdmin` (canonical admin), `demoCustomer`, `seedOrders` (`ord-demo-1`, `ord-demo-used`), `seedTickets` (`tkt-demo-1`, `tkt-demo-used`), `mockMatches`, `mockZones`,
`mockNews`, `minimumPrice`, `zoneAvailability`.

**`apps/mobile`** (Expo Router)
- Auth flow: `welcome`, `login`, `register`, password toggle, `signInDemo`.
- Tabs: home (next match, news feature), tickets, profile.
- Screens: `match/[id]`, `seats/[matchId]`, `checkout`, `orders`, `ticket/[id]`, `news/[id]`.
- `lib/store.tsx` — `AppProvider` + `AsyncStorage` + `purchase` (tightly coupled to `takenSeatIds`).
- `components/ui.tsx`, `components/match-card.tsx`, `components/ticket-card.tsx` (no `qrPayload` coupling).
- `lib/theme.ts` — spreads shared `palette`, adds `colors.muted = '#64748B'` (≠ `palette.inkMuted`).

**`apps/admin`** (Next.js App Router, **Next 16 Turbopack**)
- `app/layout.tsx` — root SC: fonts, `metadata`, `<AdminProvider>` directly inside `<body>`.
- `login` page (hardcoded `admin@xclub.app` / `xclubadmin` prefill).
- `dashboard/layout.tsx` — client `useAdmin()` gate + sidebar + mobile pill nav.
- `dashboard/page.tsx`, `matches/page.tsx`, `matches/[id]/page.tsx`, `news/page.tsx`, `tickets/page.tsx`, `scan/page.tsx`.
- `components/ui.tsx` (`Badge`, tones), `globals.css` (Tailwind `@theme` tokens, `.btn-primary`/`.btn-gold`/`.btn-ghost`, **no `.btn-danger`**).
- `lib/store.tsx` — full admin CRUD is functional (matches/zones/news create+update+delete; `addZone` hardcodes `rows:['A','B'], seatsPerRow:10`).

### A.2 Gaps

| # | Gap | Impact |
|---|---|---|
| G1 | No backend / API. Mobile and admin hold independent stores. | Purchases never reach admin; scans never validate real mobile tickets |
| G2 | No database. `localStorage` / `AsyncStorage` only. | No persistence or audit |
| G3 | Fake auth (hardcoded admin string, local-only mobile sign-in). | Critical security hole |
| G4 | Fake payments (`paymentRef` generated client-side; orders marked `paid` without a PSP). | Cannot take money |
| G5 | Unsigned QR (`MockQrPayload` is plain JSON). | Trivial forgery / double-entry |
| G6 | No seat concurrency control; `checkout` timer is a local `setSecondsLeft(600)` disconnected from any server. | Oversell |
| G7 | Admin CRUD exists but is not server-backed; no audit, no reports, no user management, no settings, no CSV. | Ops blocked on matchday |
| G8 | Mobile polish missing: no profile edit, notifications, deep links, offline, legal, loading splash (`_layout` returns `null` while hydrating). | Store-review + retention risk |
| G9 | No runtime validation layer (no zod). | Crash + injection surface |
| G10 | No tests, no CI, no error boundaries, no i18n, no a11y, no analytics. | Cannot ship safely |
| G11 | No EAS config, store metadata, staging/prod envs, runbooks. | Cannot launch |
| G12 | `apps/mobile/scripts/reset-project.js` (Expo template residue) + `minimumPrice → Infinity` bug on completed matches. | Confusion + visible `฿Infinity` |

### A.3 Architecture decisions (locked)

- **`apps/api`** — new Fastify + TypeScript service. Isolates payments and mobile from admin.
- **PostgreSQL + Prisma** — schema owned by `apps/api/prisma`.
- **`packages/shared`** becomes contract layer: `entities.ts` / `dto.ts` / `schemas.ts` (zod) / `qr.ts` (HMAC v2) / `http.ts` (envelope) / `money.ts` / `format.ts` / `constants.ts`.
- **Auth** — Argon2id password hash, JWT access (15m) + rotating refresh (30d) in `httpOnly` cookie (admin) or `expo-secure-store` (mobile). Role check enforced server-side.
- **Payments** — Opn Payments (THB-native). **Webhook is the only writer of `paid`.**
- **QR** — `HMAC-SHA256(ticketId|matchId|orderId|nonce, serverKey)` in `TicketQrPayloadV2`. Scan endpoint verifies + single-use atomically.
- **Clients** — TanStack Query for server data; local store kept only for session/token.

---

## §B High-Level Roadmap

| Phase | Name | Outcome | Depends on |
|---|---|---|---|
| 0 | Recon & Baseline | Build green; baseline captured in §G | — |
| 1 | Foundations & Tooling | Workspaces, TS refs, lint, env, CI, test harness, missing deps | 0 |
| 2 | Shared Contracts | Zod schemas, HTTP envelope, QR HMAC v2, formatters, money guards, minimumPrice fix | 1 |
| 3 | Data Layer | Prisma schema + migrations + deterministic seed (ports `mock.ts`) | 2 |
| 4 | API Core | Bootable Fastify server: config, logger, error handler, health | 3 |
| 5 | Identity & Access | Register/login/refresh/logout, roles, admin guard, rate limiting | 4 |
| 6 | Catalog & Availability | Match/zone/seat read APIs + seat-hold mechanism with TTL | 5 |
| 7 | Commerce & Fulfilment | Orders, PSP charge, webhook, ticket issuance, PDF receipts | 6 |
| 8 | Verification | Signed QR, atomic scan endpoint, admin scanner + offline queue | 7 |
| 9 | Admin Console | 9a providers/hooks · 9b migrate surfaces · 9c delete legacy store | 8 |
| 10 | Mobile | 10a API client · 10b migrate screens · 10c delete legacy state | 9 |
| 11 | Quality & Polish | Tests, E2E, a11y, i18n, empty/error states, error boundaries, metadata | 10 |
| 12 | Release | EAS, metadata, staging/prod, runbooks | 11 |

---

## §C Micro-Task Execution Plan

> Format: `ID · file — action — **DoD**: acceptance`.
> `[N]` = new in this final version. `[M]` = modification of an earlier task.

---

### Phase 0 — Recon & Baseline

- [ ] `P0-01'` · *chat* — post full contents of any file not yet shared. **DoD:** Architect confirms all files visible.
- [ ] `P0-02'` · *repo root* — `pnpm install && pnpm -w typecheck`, post output. **DoD:** v0 baseline captured into §G.
- [ ] `P0-03'` · `PLAN.md` — append §G with the findings from `P0-02'`. **DoD:** no Phase 3+ task starts against unrecorded failures.

---

### Phase 1 — Foundations & Tooling

- [ ] `P1-01` · `package.json` (root) — add `typecheck`, `lint`, `test`, `db:*`, `api:dev` scripts.
- [ ] `P1-02` · `pnpm-workspace.yaml` — include `apps/*`, `packages/*`.
- [ ] `P1-03` · `tsconfig.base.json` (root) — strict, `moduleResolution: bundler`, path aliases `@xclub/shared`, `@xclub/db`.
- [ ] `P1-04` · `apps/admin/eslint.config.mjs` — add `no-explicit-any` (error), `no-console` (error), `import/order`.
- [ ] `P1-05` · `apps/mobile/eslint.config.js` — same rules as `P1-04`.
- [ ] `P1-06` · `.editorconfig` (root) — LF, 2-space, final newline.
- [ ] `P1-07` · `.gitignore` — add `apps/api/.env*`, `dist`, `coverage`, `.expo`, `*.pdf`.
- [ ] `P1-08` · `.env.example` (root) — `DATABASE_URL`, `JWT_SECRET`, `REFRESH_SECRET`, `TICKET_HMAC_KEY`, `OPN_SECRET_KEY`, `OPN_WEBHOOK_SECRET`, `NEXT_PUBLIC_ADMIN_URL`,
`NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD`.
- [ ] `P1-09` · `packages/shared/package.json` — add `"build"` + `"exports"` map + `zod` dep.
- [ ] `P1-10` · `packages/shared/tsconfig.json` — extend base, `composite: true`.
- [ ] `P1-11` · `.github/workflows/ci.yml` — install → lint → typecheck → test → build.
- [ ] `P1-12` · `apps/api/vitest.config.ts` (**new**) — node environment. **DoD:** `apps/api` install works when `P3-01` lands.
- [ ] `P1-13` · `packages/shared/src/__tests__/smoke.test.ts` — asserts `formatTHB(150000) === "฿1,500"`.
- [ ] `P1-14` · `apps/mobile/scripts/reset-project.js` — **delete**.
- [ ] **[N] P1-15** · `apps/mobile/package.json` — add `expo-secure-store`, `expo-notifications`, `expo-keep-awake`, `expo-file-system`, `@tanstack/react-query`. **DoD:** `pnpm install`
clean; `npx expo config` no plugin warnings.
- [ ] **[N] P1-16** · `apps/admin/package.json` — add `@tanstack/react-query`.

---

### Phase 2 — Shared Contracts

- [ ] `P2-01` · `packages/shared/src/http.ts` (**new**) — `ApiResponse<T>`, `ApiError`, `ErrorCode` union
(`unauthorized|forbidden|not_found|conflict|validation|rate_limited|payment_required|internal`).
- [ ] `P2-02` · `packages/shared/src/types.ts` — split into `entities.ts` (DB-shaped) + `dto.ts` (wire). Keep `types.ts` as re-export shim.
- [ ] `P2-03` · `packages/shared/src/schemas.ts` (**new**) — zod schemas for every DTO. `z.infer` equals DTO type (compile-asserted).
- [ ] `P2-04` · `packages/shared/src/schemas.ts` — request schemas: `signInSchema`, `signUpSchema`, `createHoldSchema`, `createOrderSchema`, `scanPayloadSchema`, `adminCreateMatchSchema`,
`adminUpdateZoneSchema`, `newsInputSchema`, `paginationSchema`, `profileUpdateSchema`, `changePasswordSchema`.
- [ ] `P2-05` · `packages/shared/src/money.ts` (**new**) — `bahtToSatang`, `satangToBaht`, `sumSatang`, `assertSatang` (integer guard).
- [ ] `P2-06` · `packages/shared/src/qr.ts` — **replace** `MOCK_QR_PREFIX`/`MockQrPayload`/`buildTicketQr`/`decodeTicketQr` with `TicketQrPayloadV2 { v:2, tid, mid, oid, n, sig }` +
`signTicketQr` + `verifyTicketQr` using WebCrypto HMAC-SHA256 + constant-time compare. **Same commit must also update:** `apps/admin/src/lib/store.tsx` (remove `decodeTicketQr`/`ticketFromQr`
usage) **and** `apps/admin/src/app/dashboard/scan/page.tsx` (demo button uses V2 fixture). **DoD:** scan demo still works; v1 payloads rejected.
- [ ] `P2-07` · `packages/shared/src/theme.ts` — **split**. Keep `palette`, `typography`, `mockBadge`; move `formatTHB`, `formatMatchDate/Time`, `formatFullDate`, `formatShortDate` to new
`format.ts`. **Must preserve both** `palette.inkMuted` **and** `mobile/lib/theme.ts`'s `colors.muted = '#64748B'` — do NOT alias. **DoD:** every import updated in the same commit (`rg "from
'.*theme'"` audit).
- [ ] `P2-08` · `packages/shared/src/format.ts` (**new**) — formatters from `P2-07`, plus `formatMatchDateTimeRange` (locale-aware, `Asia/Bangkok`).
- [ ] `P2-09` · `packages/shared/src/constants.ts` (**new**) — `SEAT_HOLD_TTL_SECONDS=600`, `MAX_SEATS_PER_ORDER=8`, `QR_VERSION=2`, `KICKOFF_LOCK_MINUTES=15`, `PENDING_ORDER_TTL_MINUTES=15`.
- [ ] `P2-10` · `packages/shared/src/index.ts` — barrel: `entities`, `dto`, `schemas`, `qr`, `theme`, `format`, `money`, `http`, `constants`.
- [ ] `P2-11` · `packages/shared/src/__tests__/schemas.test.ts` — ≥20 invalid-payload cases.
- [ ] `P2-12` · `packages/shared/src/__tests__/qr.test.ts` — v2 sign/verify, tamper, v1 rejection, constant-time compare.
- [ ] `P2-13` · `packages/shared/src/__tests__/money.test.ts` — satang round-trip, integer enforcement.
- [ ] **[N] P2-14** · `packages/shared/src/mock.ts` — change `minimumPrice(matchId)` to return `0` when no zone matches (instead of `Number.POSITIVE_INFINITY`). **DoD:** completed-match
callers render `฿0` not `฿Infinity`.
- [ ] **[N] P2-15** · `apps/mobile/src/app/match/[id].tsx` — guard hero price-from display when `Math.min(...[]) === Infinity`; render "Not on sale". **DoD:** completed match (m-ryg) shows
correct UI.

---

### Phase 3 — Data Layer

- [ ] `P3-01` · `apps/api/package.json` (**new**) — deps: `fastify`, `@fastify/cors`, `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`, `@prisma/client`, `argon2`, `jose`, `pino`,
`zod`, `pdfkit`, `opn`; dev: `prisma`, `tsx`, `vitest`.
- [ ] `P3-02` · `apps/api/tsconfig.json` (**new**) — extends base, refs `@xclub/shared`.
- [ ] `P3-03` · `apps/api/prisma/schema.prisma` — datasource + enums.
- [ ] `P3-04` · `apps/api/prisma/schema.prisma` — `User`.
- [ ] `P3-05` · `apps/api/prisma/schema.prisma` — `Match`, `Zone`, `Seat` (`@@unique([zoneId,row,number])`).
- [ ] `P3-06` · `apps/api/prisma/schema.prisma` — `SeatHold`.
- [ ] `P3-07` · `apps/api/prisma/schema.prisma` — `Order`, `OrderSeat` (`ticketId @unique`).
- [ ] `P3-08` · `apps/api/prisma/schema.prisma` — `Ticket` (`qrNonce @unique`), indexes.
- [ ] `P3-09` · `apps/api/prisma/schema.prisma` — `ScanEvent`, `NewsItem`, `RefreshToken`, `AuditLog`, `AppSetting` (`key @unique`, `value Json`, `updatedAt`, `updatedById`).
- [ ] `P3-10` · `apps/api/prisma/migrations/*` — commit generated set.
- [ ] `P3-11` · `apps/api/src/lib/prisma.ts` (**new**) — singleton with dev hot-reload guard.
- [ ] **[M] P3-12** · `apps/api/prisma/seed.ts` (**new**) — **import `demoAdmin` from `packages/shared/src/mock.ts`** (do NOT re-declare); port `seedOrders` (`ord-demo-1`, `ord-demo-used`)
and `seedTickets` (`tkt-demo-1`, `tkt-demo-used`) verbatim with exact IDs, seats, statuses; generate 3 matches × 3 zones × rows×seatsPerRow. Idempotent via upsert on stable IDs. **DoD:**
`SELECT * FROM orders WHERE id LIKE 'ord-demo%'` returns 2 rows; `pnpm db:seed` twice → identical row counts.
- [ ] `P3-13` · `apps/api/prisma/seed.ts` — inject fixed demo ticket + signed V2 QR fixture for the admin demo-pass button.
- [ ] `P3-14` · `packages/shared/src/mock.ts` — mark `@deprecated` header; keep exports until Phase 10 completes.
- [ ] `P3-15` · `packages/shared/src/mock.ts` — **delete** at end of Phase 10 (tracked here for sequencing).

---

### Phase 4 — API Core

- [ ] `P4-01` · `apps/api/src/config.ts` — zod-validated env (fail-fast on missing secret).
- [ ] `P4-02` · `apps/api/src/lib/logger.ts` — pino, redact `authorization`, `cookie`, `password`, `sig`.
- [ ] `P4-03` · `apps/api/src/lib/errors.ts` — `AppError` + `toApiError(err)` mapping zod/prisma/unknown.
- [ ] `P4-04` · `apps/api/src/plugins/error-handler.ts` — Fastify handlers using `P4-03`.
- [ ] `P4-05` · `apps/api/src/plugins/security.ts` — helmet, CORS allowlist from env, 256kb body limit.
- [ ] `P4-06` · `apps/api/src/plugins/rate-limit.ts` — 100/min global, per-route overrides.
- [ ] `P4-07` · `apps/api/src/plugins/request-context.ts` — `requestId`, user, gateId.
- [ ] `P4-08` · `apps/api/src/routes/health.ts` — `GET /health`, `GET /health/ready`.
- [ ] `P4-09` · `apps/api/src/app.ts` — `buildApp()`.
- [ ] `P4-10` · `apps/api/src/server.ts` — listen, graceful SIGTERM.
- [ ] `P4-11` · `apps/api/src/lib/validate.ts` — `validateBody/Query/Params(schema)`.
- [ ] `P4-12` · `apps/api/src/__tests__/health.test.ts` — inject tests.

---

### Phase 5 — Identity & Access

- [ ] `P5-01` · `apps/api/src/lib/password.ts` — Argon2id hash + verify.
- [ ] `P5-02` · `apps/api/src/lib/tokens.ts` — access/refresh sign + verify + rotation.
- [ ] `P5-03` · `apps/api/src/services/auth.service.ts` — register/login/refresh/logout/me, `AuditLog` writes.
- [ ] `P5-04` · `apps/api/src/routes/auth.ts` — `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`.
- [ ] `P5-05` · `apps/api/src/plugins/auth.ts` — `authenticate`, `requireRole('admin')`.
- [ ] `P5-06` · `apps/api/src/routes/auth.ts` — admin login uses `httpOnly; Secure; SameSite=Strict` cookie; mobile returns token in body via `X-Client: mobile` header.
- [ ] `P5-07` · `apps/api/src/routes/auth.ts` — strict rate limit (5/min per IP+email) on login/register.
- [ ] `P5-08` · `apps/api/src/services/user.service.ts` — `getProfile`, `updateProfile`, initials.
- [ ] `P5-09` · `apps/api/src/routes/users.ts` — `GET/PATCH /me`, `POST /me/password` (revokes all refresh tokens).
- [ ] `P5-10` · `packages/shared/src/schemas.ts` — add `profileUpdateSchema`, `changePasswordSchema`.
- [ ] `P5-11` · `apps/api/src/__tests__/auth.test.ts` — full flow integration.
- [ ] `P5-12` · `apps/api/src/scripts/create-admin.ts` — promote user CLI.

---

### Phase 6 — Catalog & Availability

- [ ] `P6-01` · `apps/api/src/services/match.service.ts` — list/getById/upcoming/nextMatch.
- [ ] `P6-02` · `apps/api/src/routes/matches.ts` — `GET /matches`, `GET /matches/:id`, `GET /matches/next`.
- [ ] `P6-03` · `apps/api/src/services/zone.service.ts` — list with derived `availableSeats`, `minPriceSatang`.
- [ ] `P6-04` · `apps/api/src/routes/zones.ts` — `GET /matches/:matchId/zones`.
- [ ] `P6-05` · `apps/api/src/services/seat.service.ts` — `getSeatMap(matchId)` with effective status (`held` if active hold).
- [ ] `P6-06` · `apps/api/src/routes/seats.ts` — `GET /matches/:matchId/seats`.
- [ ] `P6-07` · `apps/api/src/services/hold.service.ts` — `createHold` in `$transaction` with row locks, `MAX_SEATS_PER_ORDER` enforced, conflict → `conflict`.
- [ ] `P6-08` · `apps/api/src/routes/holds.ts` — `POST /holds`, `DELETE /holds/:id`, `GET /holds/:id`.
- [ ] `P6-09` · `apps/api/src/jobs/expire-holds.ts` — sweeper invoked from `server.ts`.
- [ ] `P6-10` · `apps/api/src/services/match.service.ts` — block holds within `KICKOFF_LOCK_MINUTES` of kickoff.
- [ ] `P6-11` · `apps/api/src/services/news.service.ts` — list/get/create/update/delete.
- [ ] `P6-12` · `apps/api/src/routes/news.ts` — CRUD with admin guard on writes.
- [ ] `P6-13` · `packages/shared/src/schemas.ts` — add `holdResponseSchema`, `seatMapSchema`, `paginationResponseSchema`.
- [ ] `P6-14` · `apps/api/src/__tests__/holds.test.ts` — race, TTL, limit, kickoff-lock.

---

### Phase 7 — Commerce & Fulfilment

- [ ] `P7-01` · `apps/api/src/lib/psp.ts` — Opn client wrapper. **Blocked by F-1 (PSP choice).**
- [ ] `P7-02` · `apps/api/src/services/order.service.ts` — `createOrderFromHold`. Sums via `sumSatang`. Status `pending`.
- [ ] `P7-03` · `apps/api/src/routes/orders.ts` — `POST /orders`.
- [ ] `P7-04` · `apps/api/src/services/order.service.ts` — `markPaid(orderId, chargeId)` idempotent; converts `OrderSeat → Ticket` with `qrNonce = randomUUID()`, marks seats `sold`, deletes
hold.
- [ ] `P7-05` · `apps/api/src/routes/webhooks/opn.ts` — raw-body signature verify, always 200 on handled.
- [ ] `P7-06` · `apps/api/src/services/order.service.ts` — `expirePendingOrders()` job (15m, release seats).
- [ ] `P7-07` · `apps/api/src/routes/orders.ts` — `GET /orders`, `GET /orders/:id` (ownership guard).
- [ ] `P7-08` · `apps/api/src/services/ticket.service.ts` — `listByUser`, `getById`, sign V2 QR payload server-side only.
- [ ] `P7-09` · `apps/api/src/routes/tickets.ts` — `GET /tickets`, `GET /tickets/:id`, `POST /tickets/:id/qr` (rotating nonce).
- [ ] `P7-10` · `apps/api/src/services/receipt.service.ts` — PDFKit; **direct port** of `buildReceiptHtml` fields from `apps/mobile/src/app/orders.tsx` (order ID, match, seats row/seat/price,
total, payment ref, disclaimer).
- [ ] `P7-11` · `apps/api/src/routes/tickets.ts` — `GET /orders/:id/receipt.pdf` streamed.
- [ ] `P7-12` · `apps/api/src/services/ticket.service.ts` — void tickets on refund.
- [ ] `P7-13` · `packages/shared/src/schemas.ts` — add `createOrderResponseSchema`, `chargeParamsSchema`, `receiptMetaSchema`.
- [ ] `P7-14` · `apps/api/src/__tests__/orders.test.ts` — create → webhook → tickets → receipt.
- [ ] `P7-15` · `apps/api/src/__tests__/webhook.test.ts` — replay same charge; single fulfilment.

---

### Phase 8 — Verification (Scan)

- [ ] `P8-01` · `apps/api/src/services/scan.service.ts` (**new**) — `verify(payload, ctx)`: version → HMAC → wrong-match → atomic `UPDATE ticket SET status='used' WHERE id=? AND
status='valid'`. **DoD:** 10-parallel-scan test → exactly one `valid`.
- [ ] `P8-02` · `apps/api/src/services/scan.service.ts` — write `ScanEvent` on **every** attempt, including rejections. Persist `sha256(rawPayload)` only.
- [ ] `P8-03` · `apps/api/src/routes/scan.ts` (**new**) — `POST /scan` (admin only, `Idempotency-Key` required).
- [ ] `P8-04` · `apps/admin/src/lib/scan-api.ts` (**new**) — typed client with cookie auth, header generator, `offlineQueue` with localStorage replay.
- [ ] `P8-05` · `apps/admin/src/app/dashboard/scan/page.tsx` — replace `useAdmin().validateTicket` with `scan-api`; remove `demoPass`; demo button fetches `/scan/demo`.
- [ ] `P8-06` · `apps/admin/src/app/dashboard/scan/page.tsx` — offline-queue badge + "sync now".
- [ ] `P8-07` · `apps/admin/src/app/dashboard/scan/page.tsx` — `used` state reads `ScanEvent.usedAt` from server.
- [ ] `P8-08` · `apps/api/src/routes/scan.ts` — `POST /scan/undo` (60s window), `GET /scan/stats`, `GET /scan/events`.
- [ ] `P8-09` · `apps/api/src/services/scan.service.ts` — reject `void` tickets and ended matches (>3h).
- [ ] `P8-10` · `apps/admin/src/lib/store.tsx` — remove `validateTicket`, `usedTicketIds`, `tickets`.
- [ ] `P8-11` · `apps/api/src/routes/scan.ts` — `GET /scan/demo` returns fixture + signed V2 payload.

---

### Phase 9 — Admin Console

> **9a extracts · 9b migrates pages one at a time · 9c deletes legacy store.** Old `useAdmin()` remains functional for pages not yet migrated.

#### 9a — Extract API client + providers + hooks

- [ ] `P9a-01` · `apps/admin/src/lib/api-client.ts` (**new**) — typed fetch, cookie auth, `ApiResponse` unwrap, `ApiError` mapping.
- [ ] `P9a-02` · `apps/admin/src/lib/use-session.ts` (**new**) — `GET /auth/me`, signed-out redirect.
- [ ] `P9a-03` · `apps/admin/src/lib/queries.ts` (**new**) — `QueryClient` config.
- [ ] `P9a-04` · `apps/admin/src/lib/queries/matches.ts` (**new**) — `useMatches`, `useMatch`, `useZones`, `useCreateMatch`, `useUpdateMatch`, `useDeleteMatch`, `useUpdateZone`, `useAddZone`,
`useDeleteZone`.
- [ ] `P9a-05` · `apps/admin/src/lib/queries/news.ts` (**new**).
- [ ] `P9a-06` · `apps/admin/src/lib/queries/orders.ts` (**new**) — `useOrders`, `useOrder`, `useAggregate`, `useRefund`.
- [ ] `P9a-07` · `apps/admin/src/lib/queries/users.ts` (**new**) — `useUsers`, `useUpdateUser`.
- [ ] **[N] P9a-08** · `apps/admin/src/components/providers.tsx` (**new, `"use client"`**) — `<ClientProviders>` wrapping `<QueryClientProvider>` + `<ToastProvider>`. **Do NOT** include
`<AdminProvider>` here during migration.
- [ ] **[N] P9a-09** · `apps/admin/src/app/layout.tsx` — wrap `<AdminProvider>` **inside** `<ClientProviders>`, both inside `<body>`. **Do NOT** add `"use client"`. **Do NOT** touch `<html
className={...}>`. **DoD:** `next build` metadata works; a page can call `useSession()`.

#### 9b — Migrate each surface

- [ ] `P9b-01` · `apps/admin/src/app/dashboard/layout.tsx` — replace `useAdmin()` gate with `useSession()`. Keep nav UI byte-identical.
- [ ] `P9b-02` · `apps/admin/src/app/login/page.tsx` — `POST /auth/login`; remove hardcoded prefill; keep "demo credentials" affordance reading `NEXT_PUBLIC_DEMO_EMAIL` /
`NEXT_PUBLIC_DEMO_PASSWORD`.
- [ ] `P9b-03` · `apps/admin/src/app/dashboard/page.tsx` — KPI cards from `useAggregate` + `useScanStats`; `now` from `new Date()`.
- [ ] `P9b-04` · `apps/api/src/routes/orders.ts` — `GET /orders/aggregate?range=30d`.
- [ ] `P9b-05` · `apps/admin/src/app/dashboard/matches/page.tsx` — from `useMatches` + `useDeleteMatch`. Keep filter tabs + search.
- [ ] `P9b-06` · `apps/admin/src/components/match-form.tsx` (**new**, extracted) — `adminCreateMatchSchema` validation.
- [ ] `P9b-07` · `apps/admin/src/app/dashboard/matches/page.tsx` — mount `<MatchForm>` for create.
- [ ] `P9b-08` · `apps/admin/src/app/dashboard/matches/[id]/page.tsx` — from `useMatch` + `useZones`.
- [ ] `P9b-09` · `apps/admin/src/components/zone-editor.tsx` (**new**, extracted).
- [ ] `P9b-10` · `apps/admin/src/app/dashboard/matches/[id]/page.tsx` — render `<ZoneEditor>`; wire mutations. **DoD:** price edit does not retroactively change `OrderSeat.priceSatang`.
- [ ] `P9b-11` · `apps/admin/src/components/zone-create-form.tsx` (**new**) — configurable `name/price/rows/seatsPerRow`. Replaces hardcoded `rows:['A','B'], seatsPerRow:10`.
- [ ] `P9b-12` · `apps/admin/src/app/dashboard/news/page.tsx` — from `useNews` + mutations.
- [ ] `P9b-13` · `apps/admin/src/components/news-form.tsx` (**new**, extracted).
- [ ] **[M] P9b-14** · `apps/admin/src/app/dashboard/tickets/page.tsx` — from `useOrders` + `useTickets`; server pagination + search. **DoD:** "12 zones across 4 upcoming matches (184 seats
for m-bkk) paginate cleanly at 25 rows/page."
- [ ] `P9b-15` · `apps/admin/src/app/dashboard/tickets/[orderId]/page.tsx` (**new**) — order detail.
- [ ] `P9b-16` · `apps/api/src/routes/orders.ts` — `POST /orders/:id/refund`. **Blocked by F-2.**
- [ ] `P9b-17` · `apps/admin/src/app/dashboard/users/page.tsx` (**new**).
- [ ] `P9b-18` · `apps/api/src/routes/users.ts` — `GET /users`, `PATCH /users/:id`. Self-demote → 409.
- [ ] `P9b-19` · `apps/admin/src/lib/export.ts` (**new**) — RFC-4180 CSV + BOM.
- [ ] `P9b-20` · `apps/admin/src/app/dashboard/tickets/page.tsx` — "Export CSV" for current filter.
- [ ] `P9b-21` · `apps/admin/src/app/dashboard/settings/page.tsx` (**new**) — club profile, gate count, QR key rotation, notifications.
- [ ] **[M] P9b-22** · `apps/admin/src/components/ui.tsx` + `apps/admin/src/app/globals.css` — add `Table`, `EmptyState`, `Skeleton`, `ConfirmDialog`, `Toast`, `Tone.amber`, and
**`btn-danger`** utility in `globals.css`. **DoD:** (a) delete/refund/key-rotation buttons use `.btn-danger`, no raw `bg-red-`/`text-red-`; (b) `rg -- '--font-' apps/admin/src/app/layout.tsx`
confirms both `--font-inter` and `--font-barlow` unchanged; (c) no existing Badge visual regression.
- [ ] **[N] P9b-24** · `apps/api/src/routes/settings.ts` (**new**) — `GET /settings`, `PATCH /settings`, writes `AuditLog`, uses `AppSetting` from `P3-09`.
- [ ] **[N] P9b-25** · `apps/api/prisma/schema.prisma` — confirm `AppSetting` model is present (introduced in `P3-09`); add if missing. **DoD:** `prisma migrate dev` idempotent.

#### 9c — Delete legacy

- [ ] `P9c-01` · `apps/admin/src/lib/store.tsx` — **delete** when `rg "useAdmin"` returns 0. **DoD:** `pnpm -w build:admin` green.
- [ ] **[N] P9c-02** · `apps/admin/src/app/layout.tsx` — remove `import { AdminProvider }` and `<AdminProvider>` wrapper. Result: `<body><ClientProviders>{children}</ClientProviders></body>`.
**DoD:** `rg "AdminProvider"` = 0; `next build` green; `<html className={...}>` byte-identical.

---

### Phase 10 — Mobile

#### 10a — Extract API client + hooks

- [ ] `P10a-01` · `apps/mobile/src/lib/api-client.ts` (**new**) — typed fetch, `API_BASE_URL` from config, single-flight refresh, `ApiError` mapping.
- [ ] `P10a-02` · `apps/mobile/src/lib/tokens.ts` (**new**) — `expo-secure-store` read/write/clear.
- [ ] `P10a-03` · `apps/mobile/src/lib/queries.ts` (**new**) — all hooks (`useMatches`, `useMatch`, `useSeatMap`, `useCreateHold`, `useOrders`, `useTickets`, `useNews`, `useProfile`,
`useUpdateProfile`, `useChangePassword`).

#### 10b — Migrate each surface

- [ ] `P10b-01` · `apps/mobile/src/app/_layout.tsx` — `QueryClientProvider` + auth bootstrap from secure tokens; replace silent `if (!hydrated) return null` with branded splash.
- [ ] `P10b-02` · `apps/mobile/src/lib/store.tsx` — reduce to `{ hydrated, profile, signIn, signInDemo, signUp, signOut }`. **Remove** `tickets`, `orders`, `takenSeatIds`, `purchase`,
`getTicket`, `getOrder`, `AsyncStorage`. Compile errors become subsequent tasks.
- [ ] `P10b-03` · `apps/mobile/src/app/(auth)/login.tsx` — `POST /auth/login` via `signIn`.
- [ ] `P10b-04` · `apps/mobile/src/app/(auth)/register.tsx` — `POST /auth/register` + auto-login.
- [ ] `P10b-05` · `apps/mobile/src/app/(tabs)/index.tsx` — `useMatches` + `useNews`; skeleton, empty state, pull-to-refresh. Remove all mock imports.
- [ ] `P10b-06` · `apps/mobile/src/app/match/[id].tsx` — `useMatch` + `useZones`.
- [ ] `P10b-07` · `apps/mobile/src/app/seats/[matchId].tsx` — `useSeatMap`; cap from `MAX_SEATS_PER_ORDER`; `useCreateHold`.
- [ ] `P10b-08` · `apps/mobile/src/app/checkout.tsx` — render from hold id (server totals). **Delete client-side 600s timer.** `useCreateOrder` → PSP URL via `expo-web-browser` → poll status.
- [ ] `P10b-09` · `apps/mobile/src/app/checkout.tsx` — cancel path (`DELETE /holds/:id`).
- [ ] `P10b-10` · `apps/mobile/src/app/(tabs)/tickets.tsx` — `useTickets`.
- [ ] `P10b-11` · `apps/mobile/src/app/ticket/[id].tsx` — `useTicket(id)`; request fresh V2 payload via `POST /tickets/:id/qr`; brightness boost + `expo-keep-awake`; keep `USED` overlay.
- [ ] `P10b-12` · `apps/mobile/src/app/orders.tsx` — `useOrders`; `downloadReceipt` streams `GET /orders/:id/receipt.pdf` to `expo-file-system` + `expo-sharing`. Keep `expo-print` for
share-preview only.
- [ ] `P10b-13` · `apps/mobile/src/app/orders/[id].tsx` (**new**) — order detail.
- [ ] `P10b-14` · `apps/mobile/src/app/(tabs)/profile.tsx` — derive from `useTickets` + `useOrders`. **Do NOT** render `profile.role`. Add links to Settings, Edit profile, Order history,
Support, Legal.
- [ ] `P10b-15` · `apps/mobile/src/app/profile/edit.tsx` (**new**) — `PATCH /me`, `POST /me/password`.
- [ ] `P10b-16` · `apps/mobile/src/app/settings.tsx` (**new**) — notifications, language, sign out, delete account, **`resetLocalSession()`** (added per v3).
- [ ] `P10b-17` · `apps/mobile/src/app/news/[id].tsx` — `useNewsItem`.
- [ ] **[M] P10b-18** · `apps/mobile/app.json` → `apps/mobile/app.config.ts` — **preserve exactly:** `scheme: "xclub"`, `web.output: "server"`, `experiments: { typedRoutes: true,
reactCompiler: true }`, `userInterfaceStyle: "light"`, plugins array **+ append `expo-notifications`**, `extra.apiBaseUrl` added. **DoD:** `npx expo config` diff vs. current `app.json` shows
only added `extra` + plugin.
- [ ] `P10b-19` · `apps/mobile/src/lib/notifications.ts` (**new**) — permission, `POST /devices`, kickoff reminders T-24h/T-2h.
- [ ] `P10b-20` · `apps/api/src/routes/devices.ts` (**new**) — `POST /devices`, `DELETE /devices/:token`.
- [ ] `P10b-21` · `apps/mobile/src/components/match-card.tsx` — accept `MatchDto`.
- [ ] **[M] P10b-22** · `apps/mobile/src/components/ticket-card.tsx` — swap `Ticket` → `TicketDto`. No props change.
- [ ] **[N] P10b-24** · `apps/mobile/src/app/orders.tsx` — **delete `buildReceiptHtml`** function and `expo-print` HTML branch in `downloadReceipt`. Isolated commit, strictly after `P10b-12`.
**DoD:** `rg "buildReceiptHtml"` = 0.

#### 10c — Delete legacy

- [ ] `P10b-23` · `packages/shared/src/mock.ts` — **delete**. **DoD:** `rg "mockMatches\|mockZones\|mockNews\|seedOrders\|seedTickets"` = 0. Executes **after** `P11-13` verification passes.
- [ ] `P10c-01` · `apps/mobile/src/lib/store.tsx` — collapse to session-only store.

---

### Phase 11 — Quality & Polish

- [ ] `P11-01` · `apps/api/src/__tests__/seat-concurrency.test.ts` — 10 parallel holds on 1 seat → 1 success.
- [ ] `P11-02` · `apps/api/src/__tests__/scan-concurrency.test.ts` — 10 parallel scans of 1 ticket → 1 `valid`.
- [ ] `P11-03` · `apps/admin/e2e/ops.spec.ts` (**new**, Playwright) — login → create match → scan demo pass → export CSV.
- [ ] `P11-04` · `packages/shared/src/i18n/th.ts` + `en.ts` (**new**) — typed string tables. **Blocked by F-8 (brand lock).**
- [ ] `P11-05` · `apps/mobile/src/lib/i18n.ts` (**new**) — locale resolver + `t()`; bound to settings toggle.
- [ ] `P11-06` · `apps/mobile/src/app/(auth)/welcome.tsx` — extract `CLUB_TAGLINE` + hero copy to i18n.
- [ ] **[M] P11-06'** · `apps/mobile/src/app/(tabs)/index.tsx` — time-aware greeting (`Intl.DateTimeFormat` with `Asia/Bangkok`). **DoD:** test at UTC 00:00/06:00/12:00/18:00.
- [ ] `P11-07` · `apps/mobile/src/app/(tabs)/_layout.tsx` — a11y pass (labels, roles, hit-slop ≥ 44pt, dynamic type).
- [ ] `P11-08` · `apps/admin/src/app/dashboard/layout.tsx` — a11y (skip-link, focus rings, `aria-current`).
- [ ] `P11-09` · `apps/mobile/src/components/ui.tsx` — add `Skeleton`, `EmptyState`, `ErrorState`.
- [ ] `P11-10` · `apps/admin/src/app/dashboard/error.tsx` + `apps/admin/src/app/dashboard/scan/error.tsx` (**new**) — Next error boundaries.
- [ ] `P11-11` · `apps/mobile/src/lib/analytics.ts` (**new**) — no-op dev adapter.
- [ ] `P11-12` · `apps/api/src/plugins/metrics.ts` (**new**) — `/metrics` Prometheus endpoint.
- [ ] **[N] P11-13** · *repo root* — verify `rg "mockMatches\|minimumPrice\|zoneAvailability" apps/mobile/src` = 0. **Gate before `P10b-23`.** **DoD:** promoted to a script
`scripts/check-no-mocks.sh` run in CI.
- [ ] **[N] P11-14** · `apps/admin/src/app/layout.tsx` — expand `metadata` (openGraph, icons, `robots: { index:false, follow:false }`, `themeColor`). **Do NOT** touch `<html
className={...}>`. **DoD:** `next build` `<head>` shows expected tags; `rg -- '--font-' layout.tsx` unchanged.
- [ ] **[N] P11-15** · `apps/admin/src/app/dashboard/*` — mark `/dashboard` route `dynamic = 'force-dynamic'` (or `no-store` fetch in dashboard layout). **DoD:** `next build` reports
`/dashboard` as `λ`, not `○`.
- [ ] `P11-16` · `apps/mobile/src/app/legal/[doc].tsx` (**new**) — terms/privacy/refund static render.

---

### Phase 12 — Release Engineering

- [ ] `P12-01` · `apps/mobile/eas.json` (**new**) — dev/preview/prod profiles.
- [ ] `P12-02` · `apps/mobile/app.config.ts` — version/build from env, `runtimeVersion`, bundle IDs.
- [ ] `P12-03` · `apps/mobile/assets/*` — final icons, splash, notification icon. **Blocked by F-8 (brand lock).**
- [ ] `P12-04` · `apps/api/Dockerfile` (**new**) — multi-stage, non-root, `prisma migrate deploy` on boot.
- [ ] `P12-05` · `docker-compose.yml` (root) — postgres + api.
- [ ] `P12-06` · `.github/workflows/deploy-api.yml` (**new**).
- [ ] `P12-07` · `.github/workflows/deploy-admin.yml` (**new**).
- [ ] `P12-08` · `docs/RUNBOOK.md` (**new**) — matchday checklist, scanner outage, refund, key rotation.
- [ ] `P12-09` · `docs/ARCHITECTURE.md` (**new**).
- [ ] `P12-10` · `README.md` — setup, env matrix, scripts, demo accounts.
- [ ] `P12-11` · `apps/mobile/store/listing.md` — store submission doc.
- [ ] **[N] P12-12** · `apps/admin/src/app/layout.tsx` — add `metadataBase: new URL(process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3000")` to `metadata`. **DoD:** `next build` green;
`<meta property="og:url">` reflects env.

---

## §D Sequencing Locks

1. **`P1-15` / `P1-16` first** — before any Phase 2 file that references the new deps.
2. **`P2-14` before `P2-15`** — fix shared helper, then mobile consumer.
3. **`P2-06` and `P2-07` are breaking** — each must land with all dependent updates in the same commit set; no >24h red time.
4. **`P3-12`** must be a single commit — seed idempotency check must pass as one atomic unit.
5. **`P9b-25` before `P9b-24`** — schema before route.
6. **`P9a-08` before `P9a-09`** — providers file before layout mounting.
7. **`P9c-01` before `P9c-02`** — delete store first, then remove the mount. `layout.tsx` stays a Server Component throughout.
8. **`P10b-02`** is the cascade seed for 10b-03..10b-24 — every subsequent 10b task unblocks one compile error.
9. **`P10b-12` strictly before `P10b-24`** — never lose the only working receipt path.
10. **`P10b-23` (delete `mock.ts`)** requires `P11-13` green AND `P2-14` applied.
11. `P11-14` and `P12-12` both edit `layout.tsx` — **do not batch**. Feature flag free; ordering P11-14 → P12-12.

---

## §E Risk Register

| # | Risk | Mitigation |
|---|---|---|
| R-01 | Client stores diverge during migration | `P9c-01` + `P10c-01` are hard gates — no QA signoff with either store still present |
| R-02 | Admin scan demo breaks on V2 QR | `P2-06` includes `scan/page.tsx` update in same commit |
| R-03 | Theme split breaks formatter imports | `rg "formatTHB\|formatMatch"` before `P2-07`; audit list in PR |
| R-04 | Mobile blank screen on cold start | `P11-09` + `P10b-01` loading splash + error boundary |
| R-05 | Client checkout timer misleads user | `P10b-08` removal is mandatory; QA verifies no `setSecondsLeft` in `checkout.tsx` |
| R-06 | `_layout.tsx` null return + no `QueryClientProvider` = double blank | `P10b-01` combines both; cold-start tested |
| R-07 | `profile.role` leaks into mobile UI | `P10b-14` DoD forbids rendering it |
| R-08 | `resetDemo` restores logged-in admin during QA | After `P9c-01`, only Sign-out; `P10b-16` provides `resetLocalSession()` on mobile |
| R-09 | `minimumPrice` returns `Infinity` post-migration | `P2-14` hard gate before `P3-12` |
| R-10 | `web.output: "server"` silently changed | `P10b-18` DoD includes `expo config` diff |
| R-11 | Client signs QR (security) | `P2-06` DoD: sign server-side only; mobile displays only |
| R-12 | `demoAdmin` duplicated | `P3-12` imports from `mock.ts`; `P9c-01` deletes local copy |
| R-13 | `colors.muted` unification changes 15+ screens | `P2-07` DoD asserts no muted-color change; preserve `#64748B` |
| R-14 | `expo-file-system` missing → receipt fails silently | `P1-15` explicit install |
| R-15 | `.btn-danger` absent → ad-hoc red styling drifts | `P9b-22` DoD includes `rg "bg-red-\|text-red-"` = 0 |
| R-16 | `layout.tsx` becomes a Client Component → metadata + font tokens dropped | `P9a-08` DoD forbids `"use client"`; `P9a-09` DoD asserts metadata works post-build |
| R-17 | `<html className>` touched → `.display` loses Barlow | `P9b-22`, `P11-14` DoDs require `rg -- '--font-' layout.tsx` post-check |
| R-18 | `AdminProvider` still mounted after `P9c-01` | `P9c-02` is a **hard gate** between `P9c-01` and Phase 11 |
| R-19 | Dashboard routes pre-rendered logged-out | `P11-15` enforces `force-dynamic` and verifies build output |

---

## §F Open Questions (blocking specific tasks)

| # | Question | Blocks |
|---|---|---|
| **F-1** | PSP: Opn Payments vs Stripe TH | `P7-01` |
| **F-2** | Refund on `used` tickets: block, or override-with-audit | `P9b-16` |
| **F-3** | Seat transfer/resale support in v1? | Phase 7.5 (would insert) |
| **F-4** | One `gateId` per scanner device, or shared? | `P8-02` shape |
| **F-5** | Admin 2FA required for production? | Phase 5.5 (would insert) |
| **F-6** | VAT 7% included in `priceSatang` or added at checkout? | `P7-10` receipt layout |
| **F-7** | `KICKOFF_LOCK_MINUTES = 15` acceptable? | `P6-10` |
| **F-8** | Brand lock: XClub/Arena/Barlow+Inter confirmed for v1? | `P11-04`, `P12-03` |

**F-1 and F-2 do not block Phase 0–4. Resolve before `P7-01` and `P9b-16` respectively.**

---

## §G Baseline (populated by `P0-03'`)

_Empty until Phase 0 executes._

---

**End of PLAN.md.**
