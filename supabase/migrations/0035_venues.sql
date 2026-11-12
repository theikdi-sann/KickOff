-- 0035_venues — proper venues/stadiums schema (punch list #12).
--
-- matches.venue was free text (default 'KickOff Arena') read in ~10 places.
-- Full normalization: a venues table is the single source of truth and
-- matches references it by id. The dependent order_receipt_view is dropped
-- here and recreated against venues in 0036.

create table public.venues (
  id text primary key default ('v_' || replace(gen_random_uuid()::text, '-', '')),
  name text not null unique,
  city text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

alter table public.venues enable row level security;

-- Catalog: readable by everyone, writable by admins (matches the matches pattern).
create policy venues_public_read on public.venues
for select to anon, authenticated using (true);

create policy venues_admin_write on public.venues
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.venues to anon, authenticated;
grant insert, update, delete on public.venues to authenticated;

-- The home venue: this row is what matches.venue_id defaults at, so bare
-- inserts (mvp-gate, API creates without a venue) keep working.
insert into public.venues (id, name, city, address)
values ('v_kickoff', 'KickOff Arena', 'Bangkok', 'KickOff Stadium, Rama IX Road')
on conflict (name) do nothing;

-- Backfill every distinct venue name that already exists in matches.
insert into public.venues (name)
select distinct venue from public.matches
on conflict (name) do nothing;

-- order_receipt_view reads m.venue — drop it before the column goes away;
-- 0036 recreates it joined to venues.
drop view if exists public.order_receipt_view;

alter table public.matches
  add column venue_id text references public.venues (id);

update public.matches m
set venue_id = v.id
from public.venues v
where v.name = m.venue and m.venue_id is null;

-- Matches created without an explicit venue fall back to the home venue.
alter table public.matches alter column venue_id set default 'v_kickoff';

alter table public.matches alter column venue_id set not null;

alter table public.matches drop column venue;

create index matches_venue_id_idx on public.matches (venue_id);
