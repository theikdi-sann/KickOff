-- C7.4 — the legacy role column is dropped.
--
-- `0041` kept `profiles.role` alive with a dual-write trigger, so the console
-- and the Edge functions could keep reading the old vocabulary while the
-- database moved on. `0045` moved the database onto the membership,
-- `0047` moved every reader and writer with it, and now the column has no
-- reader, no writer and no guard.
--
-- What goes:
--   * the column and its check constraint
--     (`role in ('customer','admin','gatekeeper')`),
--   * `profiles_sync_staff_member` — the dual-write bridge,
--   * `profiles_prevent_role_escalation` — the guard that protected the
--     column it goes with.
--
-- What stays: the authority itself. `staff_members` with `staff_roles` (the
-- membership and the club's vocabulary) and `auth.users.app_metadata.role`
-- (the claim the Edge guards read) are untouched.
--
-- Idempotent: every drop is `if exists`.

drop trigger if exists profiles_sync_staff_member on public.profiles;
drop trigger if exists profiles_prevent_role_escalation on public.profiles;

drop function if exists public.sync_staff_member();
drop function if exists public.prevent_role_escalation();

alter table public.profiles drop column if exists role;
