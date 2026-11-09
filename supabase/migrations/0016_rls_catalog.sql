-- 0016_rls_catalog — public catalog reads, admin-only writes.
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.zones enable row level security;
alter table public.seats enable row level security;
alter table public.news_items enable row level security;

-- profiles: own row (or admin).
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Catalog: readable by everyone, writable by admins.
create policy matches_public_read on public.matches
for select to anon, authenticated using (true);
create policy matches_admin_write on public.matches
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy zones_public_read on public.zones
for select to anon, authenticated using (true);
create policy zones_admin_write on public.zones
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy seats_public_read on public.seats
for select to anon, authenticated using (true);
create policy seats_admin_write on public.seats
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- News: unpublished drafts are admin-only.
create policy news_public_read on public.news_items
for select to anon, authenticated
using (published_at <= now() or public.is_admin());
create policy news_admin_write on public.news_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select on public.matches, public.zones, public.seats, public.news_items to anon, authenticated;
grant insert, update, delete on public.matches, public.zones, public.seats, public.news_items to authenticated;
