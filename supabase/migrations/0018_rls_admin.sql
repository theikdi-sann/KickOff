-- 0018_rls_admin — operational tables are admin-read only.
alter table public.scan_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.stripe_events enable row level security;

create policy scan_events_admin_read on public.scan_events
for select to authenticated using (public.is_admin());

create policy audit_logs_admin_read on public.audit_logs
for select to authenticated using (public.is_admin());

create policy app_settings_read on public.app_settings
for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stripe_events_admin_read on public.stripe_events
for select to authenticated using (public.is_admin());

-- rate_limits has RLS enabled and no policies: service role only.

grant select on public.scan_events, public.audit_logs, public.app_settings,
  public.stripe_events to authenticated;
grant insert, update, delete on public.app_settings to authenticated;
