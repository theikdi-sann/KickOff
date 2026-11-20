# TRUTH — canonical repository facts

This document is the **single register of verified facts** the rest of the
documentation must agree with. When a document disagrees with this page, the
document is wrong. Each fact names how it was verified, so the register can be
re-checked instead of trusted.

- **Last verified:** 2026-11-20, against `40e2f26` plus the working tree.
- **Owner:** engineering. **Change rule:** update this page first, then every
  document that repeats the fact.

## 1. Delivery state

| Fact | Value | Verified by |
|---|---|---|
| Migrations | **67** ordered SQL files; next is `0068` | `ls supabase/migrations/*.sql \| wc -l` |
| Edge Functions | **20** (excluding `_shared` and `tests`) | `supabase/functions/*/index.ts` |
| pgTAP | **444 assertions across 29 suites** | `bash scripts/run-pgtap.sh` |
| Repo/JS tests | **309** | `npm test` |
| Postgres | **17** | deployment / `supabase/config.toml` |
| Availability target | **99.5 % monthly** | NFR-14 |
| Latest requirement ID | `REQ-046` is the latest assigned | `docs/REQUIREMENTS.md` |

## 2. Tenancy and accounts

| Fact | Value |
|---|---|
| Tenancy | **Shipped since `0045`.** One Supabase project serves many clubs. |
| Club resolution | `current_tenant()` reads `app_metadata.tenant_id`; a missing/empty claim falls back to the default club, a present claim stays strict. |
| Isolation | Every tenant-scoped table carries `tenant_id`; composite FKs make cross-club references impossible; RLS scopes reads and writes. |
| Identity | **Global.** `auth.users` 1—1 `profiles`; no tenant column on `profiles`. |
| Staff authority (database) | `staff_members(id, tenant_id, staff_role)` joined to `staff_roles(tenant_id, code)` with capability flags. `is_admin()`, `is_staff()` and `is_gate_operator()` read this membership at `current_tenant()`. |
| Staff authority (Edge) | `auth.users.app_metadata.role` — the claim `requireAdmin` / `requireStaff` read. |
| Legacy projection | `public.profiles.role` was **dropped in `0048`** with its dual-write trigger. No code may read or write it. |
| Built-in staff roles | **Exactly `admin` and `gatekeeper`.** `admin` holds every capability; `gatekeeper` holds gate operation only. |
| `customer` | **Not a staff role.** It means *no `staff_members` row* at the current club. It appears in the role vocabulary only so the console and the claim can name the no-authority state. |
| Role assignment | An admin writes the **membership** and the **JWT claim** together, membership first; a failed claim write restores the membership. Assigning `customer` deletes the membership and sets the claim to `customer`. |
| Apply window | A role change reaches an existing session at the next access-token refresh; the console states this. |
| Custom roles | **Not implemented.** `REQ-046` / `GAP-11` are **open**. A club cannot add a role today. |

## 3. Requirement states that are easy to get wrong

| Requirement | State | Note |
|---|---|---|
| NFR-09 multi-tenant isolation | **shipped** | `0045`, isolation suite T-01…T-24 |
| NFR-10 per-club role definition | **open** | built-in pair shipped; custom roles are REQ-046 / GAP-11 |
| GAP-02 multi-tenancy | **closed** | `0045` |
| GAP-03 fixed staff-role pair | **closed** | `0039`/`0041` delivered the built-in pair with per-club capability flags |
| GAP-11 custom club roles | **open** | REQ-046; acceptance `RBAC-1…RBAC-8` pending |
| `is_platform_admin()` | **shipped** | `0054` |
| Offline pass cache | **shipped** | `GAP-01` closed at C10.3 |

## 4. Testgen contract

- A requirement marked **`open`** is testable but not implemented.
- Its acceptance IDs are listed in `TESTING.md` §10 as **pending**; they are
  registered as `test.todo` so they cannot be mistaken for green coverage.
- `/testgen` must emit them with `status: "pending"` and the requirement ID.
- When the feature ships, the requirement flips to `shipped`, the `todo`
  becomes a real test, and the pending row is removed in the same change.

## 5. Retention and operations

| Data | Retention |
|---|---|
| Orders, tickets, refunds, audit logs | 7 years |
| `scan_events` | 3 years |
| `stripe_events` | 90 days |
| `error_events` | 30 days |
| Unused `device_tokens` | 90 days |

RPO ≤ 24 h, RTO ≤ 4 h. The quarterly restore drill is recorded in the release
ticket. Details: `PRIVACY.md`, `RUNBOOK.md`.
