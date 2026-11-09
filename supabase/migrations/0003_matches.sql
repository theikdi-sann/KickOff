-- 0003_matches — fixture catalog.
create table public.matches (
  id text primary key default ('m_' || replace(gen_random_uuid()::text, '-', '')),
  opponent text not null,
  opponent_short text not null,
  kickoff_at timestamptz not null,
  venue text not null default 'XClub Arena',
  competition text not null default 'Thai Premier League',
  home_away text not null default 'home' check (home_away in ('home', 'away')),
  status public.match_status not null default 'upcoming',
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  poster_colors text[] not null default array['#0B6B3A', '#052E1A']::text[],
  accent text not null default '#F4C430',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_kickoff_at_idx on public.matches (kickoff_at);
create index matches_status_idx on public.matches (status);

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();
