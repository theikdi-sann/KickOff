# FLOW AUDIT — KickOff B2B

The Phase C3 audit: every user flow, read against six questions, and every
finding recorded with a severity and a status. This document is the evidence
behind the changes in the Phase C commits; the fixes themselves are separate
TDD cycles.

- **Scope:** 29 user flows — 14 supporter (mobile) flows and 15 staff (admin)
  flows.
- **Questions per flow:** entry · trust boundary · validation · failure path ·
  audit trail · test proof.
- **Last verified:** 2026-11-13 · **Owner:** engineering
- **Related:** [`REQUIREMENTS.md`](REQUIREMENTS.md) (what it must do) ·
  [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) ·
  [`SECURITY.md`](SECURITY.md) · [`PLAN.md`](../PLAN.md) (status and decisions)

---

## 1. Method

Each flow was read end to end: the screen, the query hook, the Edge Function
or RPC behind it, the RLS policy that guards it, and the test that proves it.
A flow counts as *proven* only when a test exercises the behaviour — a
source-text assertion or a skipped Playwright case does not count.

**Severity**

| Severity | Meaning |
|---|---|
| **Critical** | The flow does not do what it claims, or a privilege boundary is not what it appears to be. |
| **High** | A failure is silent, data can be lost, or a stated guarantee (audit trail, access control) is missing. |
| **Medium** | The flow works but violates a standard: duplicated truth, untested behaviour, misleading copy, non-atomic writes. |
| **Low** | Polish. |

---

## 2. Supporter flows (mobile)

| Flow | Entry | Trust boundary | Validation | Failure path | Audit | Test proof |
|---|---|---|---|---|---|---|
| M1 Register | `(auth)/register.tsx` | GoTrue sign-up → DB trigger `handle_new_user` | ad-hoc (screen) | surfaced | — | **none** |
| M2 Sign in | `(auth)/login.tsx` | GoTrue + RLS `profiles_select_own` | ad-hoc | surfaced | — | Maestro smoke only |
| M3 Password reset | `(auth)/forgot-password.tsx`, `reset-password.tsx` | GoTrue | ad-hoc | surfaced | — | **none** |
| M4 Email verification | `(auth)/check-email.tsx`, `auth/callback.tsx` | GoTrue link → local session | ad-hoc | surfaced | — | **none** |
| M5 Browse fixtures | `fixtures.tsx`, `match/[id].tsx` | PostgREST + public read RLS | mappers only | **silent** (F-01) | — | Maestro smoke only |
| M6 Read news | `news.tsx`, `news/[id].tsx` | PostgREST + `news_public_read` | mappers only | **silent** (F-01) | — | **none** |
| M7 Select seats + hold | `seats/[matchId].tsx` | RPC `create_hold` (security definer) | server-side PL/pgSQL + ad-hoc client cap | surfaced | `seat_holds` | Maestro smoke only |
| M8 Checkout + pay | `checkout.tsx` | Edge `stripe-checkout` → Stripe; amount from DB | Zod (function-local) | surfaced | `orders`, `order_seats`, `stripe_events` | function test + Maestro |
| M9 Receive pass | `ticket/[id].tsx` | Edge `ticket-qr`, ownership check | Zod (function-local) | **swallowed** (F-02) | — | function test (QR prefix) |
| M10 Order history + receipt | `orders.tsx`, `orders/[id].tsx` | RLS + Edge `receipt` (ownership check) | Zod (function-local) | surfaced (Alert) | storage object | function test (PDF bytes) |
| M11 Edit profile | `profile/edit.tsx` | RLS `profiles_update_own` + trigger | ad-hoc | surfaced | profile row | **none** |
| M12 Push opt-in | `settings.tsx` → `lib/notifications.ts` | Edge `devices`, scoped to the caller | Zod (function-local) | surfaced | `device_tokens` | contract only |
| M13 Settings + sign out | `settings.tsx`, `(tabs)/profile.tsx` | GoTrue | n/a | **swallowed** on one path (F-03) | — | **none** |
| M14 Delete account | `settings.tsx` | Edge `delete-account` (self or admin) | Zod (function-local) | surfaced | `audit_logs` | **none** |

**Money:** no mobile request ever carries an amount. `stripe-checkout`
recomputes the total from `order_seats.price_satang` and rejects a mismatch.
The client-computed totals in the seat map and the checkout summary are
display-only.

---

## 3. Staff flows (admin console)

| Flow | Entry | Trust boundary | Validation | Failure path | Audit | Test proof |
|---|---|---|---|---|---|---|
| A1 Sign-in + MFA | `login/page.tsx`, `login/mfa/page.tsx` | GoTrue + client-side role read; MFA enforced by `proxy.ts` | ad-hoc | surfaced | — | Playwright, **skipped** without env |
| A2 Overview | `dashboard/page.tsx` | RLS + Edge `orders-aggregate` (admin) | Zod (function-local) | surfaced | — | source-text assertions only |
| A3 Manage fixtures | `dashboard/matches/**` | direct PostgREST write, RLS `is_admin()` | Zod (shared) | surfaced | **none** (F-05) | Playwright UI |
| A4 Zones / seats / prices | `dashboard/matches/[id]` | direct PostgREST write, RLS | Zod (shared) | surfaced; rollback error unchecked (F-08) | **none** (F-05) | **none** |
| A5 Manage venues | `dashboard/venues/page.tsx` | direct PostgREST write, RLS | ad-hoc | surfaced | **none** (F-05) | migration/DB tests only |
| A6 Gates + assignment | `dashboard/gates/page.tsx` | direct PostgREST write, RLS | ad-hoc | surfaced | **none** (F-05) | Playwright UI |
| A7 Scan ticket | `dashboard/scan/page.tsx` | Edge `scan-ticket` — `requireAdmin` + RPC `is_admin()` | Zod (function-local) | surfaced | `scan_events` | function test (7 cases) + pgTAP + Playwright |
| A8 Undo scan | `dashboard/scan/page.tsx` | Edge `scan-undo` — `requireAdmin` + RPC | Zod (function-local) | surfaced | `audit_logs` (`scan.undo`) | function test + Playwright |
| A9 Offline scan queue | `lib/offline-queue.ts` | localStorage → replayed through `scan-ticket` | hand-written guard | **silent discard** (F-04) | on replay | **none** |
| A10 Orders + CSV export | `dashboard/tickets/**` | RLS + Edge `orders-aggregate`; export is browser-only | ad-hoc | surfaced | **none** for the export (F-05) | Playwright (header only) |
| A11 Refund order | `dashboard/tickets/**` | Edge `refund-order` — `requireAdmin` | Zod (function-local; duplicate of the shared schema) | surfaced | `audit_logs` (`order.refund`) | Playwright, **skipped** without keys |
| A12 Publish news | `dashboard/news/page.tsx` | direct PostgREST write, RLS | Zod (shared) | surfaced | **none** (F-05) | schema only |
| A13 Manage users / roles | `dashboard/users/page.tsx` | Edge `admin-users` — `requireAdmin` | Zod (function-local) | surfaced | `audit_logs` (`admin.user.update`) | **none** |
| A14 Club settings | `dashboard/settings/page.tsx` | direct PostgREST upsert, RLS | ad-hoc (`clampInt` silently coerces) | surfaced | **none** — but the page claims otherwise (F-06) | source-text assertions only |
| A15 Reschedule kickoff | `components/match-form.tsx` | direct PostgREST write + client-side audit insert | Zod (shared `adminRescheduleSchema`) | surfaced; **not atomic** (F-07) | `audit_logs` (`reschedule`) | unit + contract + pgTAP |

**Effective authorisation** for every admin mutation is RLS `public.is_admin()`
(JWT claim `app_metadata.role`) or `requireAdmin` in the Edge Function. The
application layer contributes no role enforcement: `proxy.ts` only proves
"signed in" and "MFA level", and the dashboard layout renders before the
client-side redirect fires (F-09).

---

## 4. Findings

| ID | Sev | Flow | Finding | Status |
|---|---|---|---|---|
| **F-10** | Critical | A13 | `admin-users` wrote only `profiles.role`, but every guard authorises on the JWT claim `app_metadata.role`. A promoted staff member was displayed as ADMIN and had **no** access; a demoted one kept access until its token refreshed. | ✅ **fixed** — the claim is written with the profile row (`scripts/tests/staff-roles.test.mjs`) |
| **F-01** | High | M5, M6 | `fixtures.tsx` and `news.tsx` render the *empty* state when the query **fails**. A network error looks like "no upcoming fixtures" / "no news yet". | ⬜ open — C3 cycle |
| **F-04** | High | A9 | A corrupted offline scan queue is discarded silently (`catch { return [] }`). Scanned passes are lost at the gate with no notice to the operator. | ⬜ open — C3 cycle |
| **F-05** | High | A3–A6, A10, A12, A14 | 17 of 19 direct-write admin mutations write **no** `audit_logs` row, although NFR-05 states privileged mutations are audited. Fixture, zone, seat, venue, gate, news, settings and CSV export are all unlogged. | ⬜ open — C3 cycle |
| **F-02** | Medium | M9 | The pass screen replaces the server error with a fixed "Tap to reload your QR" — the actual reason is never shown. | ⬜ open — C3 cycle |
| **F-03** | Medium | M13 | Sign-out from the profile screen swallows the failure (`catch(() => undefined)`): the operator is left signed in with no message. | ⬜ open — C3 cycle |
| **F-06** | Medium | A14 | The settings page states that changes are "recorded with the admin actor", but no `audit_logs` row is written — only `app_settings.updated_by`. The copy is false. | ⬜ open — C3 cycle |
| **F-07** | Medium | A15, A11 | Neither the reschedule nor the refund is atomic: the mutation lands before the audit row (reschedule) or before the DB state update (refund, where the Stripe refund happens first). A failure in between leaves a moved kickoff without an audit row, or a refunded Stripe order still marked `paid`. | ⬜ open — C4 cycle |
| **F-08** | Medium | A4 | The zone rollback deletes the new zone **without checking the delete error**, so a failed rollback leaves an orphan zone while the operator is told it was removed. | ⬜ open — C3 cycle |
| **F-09** | Medium | all admin | `proxy.ts` performs no admin-role check and the dashboard layout renders `AdminShell` before the client-side redirect fires. RLS still protects the data, but the console is reachable by any signed-in account. | ⬜ open — C4 cycle |
| **F-11** | Medium | all | The shared Zod schemas (`signInSchema`, `settingsUpdateSchema`, `refundOrderSchema`, `paginationSchema`, …) are **not used by the apps**; both consoles validate ad-hoc, and `refund-order` re-defines a copy of the shared schema. | ⬜ open — C4 cycle |
| **F-12** | Medium | all | The order/ticket row→DTO mapping was implemented twice — once in the shared package, once in each app — and the app copies had no tests. | ✅ **fixed** — the shared package owns every mapper (`HYG-8`) |
| **F-13** | Medium | A2 | The overview labels all-time scan counts as "last 30 days", and `useScanStats` loads every `scan_events` row with no limit. | ⬜ open — C5 cycle |
| **F-14** | Medium | mobile | The supporter app has **no unit tests at all** (`apps/mobile/package.json` `test` script is a placeholder). | ⬜ open — C4 cycle |
| **F-15** | Low | mobile | 15 non-null assertions (`!`) remain in `apps/mobile/src`, against the standard in `ARCHITECTURE.md` §6.1. | ⬜ open — C4 cycle |
| **F-16** | Low | A10 | The CSV export writes holder names and e-mail addresses to the operator's disk with no record of the export. | ⬜ open — C5 cycle |
| **F-17** | Low | A2 | Sell-through is computed in the browser from the zone layout while the authoritative `zone_availability` view exists. | ⬜ open — C5 cycle |

### Fix order

1. **F-10** (done) — the only Critical finding; it broke a headline B2B feature.
2. **F-01, F-02, F-03, F-04, F-08** — silent failures: the operator or the
   supporter is told nothing when something goes wrong.
3. **F-05, F-06** — the audit trail NFR-05 promises.
4. **F-07, F-09, F-11** — atomicity and the trust boundary.
5. **F-13 … F-17** — scale, standards and polish.

---

## 5. What the audit did not find

- **No client-trusted money.** No request from either app carries an amount;
  the server recomputes every total from the database and rejects a mismatch.
- **No unguarded privileged Edge Function.** Every function that moves money,
  admits a supporter or changes a role calls `requireAdmin` (and the SQL RPC
  re-checks `is_admin()`).
- **No secret in a client bundle.** Both apps use the anon key; the service
  role key exists only in the Edge Functions.
