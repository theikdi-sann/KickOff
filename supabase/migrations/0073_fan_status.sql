-- REQ-26 — a club admin manages fan accounts: suspend (temporary lock-out)
-- or soft-delete (the account cannot sign in, the row stays for audit).
--
-- `fans` is the person row. Status is the club-facing state; the auth user is
-- banned for a suspension and soft-deleted for a deletion, so the same action
-- stops sign-in and token refresh. Staff accounts are handled by
-- `staff_members`/`admin-users`; a fan never carries a membership.

alter table public.fans
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists fans_set_updated_at on public.fans;
create trigger fans_set_updated_at
before update on public.fans
for each row execute function public.set_updated_at();

-- Existing self-read policy stays (a fan sees their own row).
-- The console needs every fan's status for the Users screen; the capability is
-- the same one that guards the rest of user management.
drop policy if exists fans_admin_read on public.fans;
create policy fans_admin_read on public.fans
for select to authenticated using (public.has_capability('manage_staff'));

notify pgrst, 'reload schema';
