-- 0011_news — club articles.
create table public.news_items (
  id text primary key default ('n_' || replace(gen_random_uuid()::text, '-', '')),
  title text not null,
  excerpt text not null default '',
  body text not null default '',
  category text not null default 'Club News'
    check (category in ('Club News', 'Match Report', 'Announcement')),
  published_at timestamptz not null default now(),
  read_minutes integer not null default 1 check (read_minutes > 0),
  image_colors text[] not null default array['#0B6B3A', '#022C22']::text[],
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index news_items_published_at_idx on public.news_items (published_at desc);

create trigger news_items_set_updated_at
before update on public.news_items
for each row execute function public.set_updated_at();
