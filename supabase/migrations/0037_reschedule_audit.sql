-- 0037_reschedule_audit — punch list #13: where the reschedule reason lives.
--
-- The walkthrough decision (Option 3): the reschedule rules are enforced in
-- the shared Zod schema + admin UI, and the client stores the reason in
-- audit_logs alongside the match update. This migration only opens the write
-- path for admins — deliberately no trigger and no RPC.

grant insert on public.audit_logs to authenticated;

create policy audit_logs_admin_insert on public.audit_logs
for insert to authenticated with check (public.is_admin());
