-- Catalog seed (no customer data). Safe to run repeatedly.
insert into public.matches
  (id, opponent, opponent_short, kickoff_at, venue, competition, home_away, status,
   home_score, away_score, poster_colors, accent)
values
  ('m-bkk', 'Bangkok Rovers', 'BKR', '2026-11-14T18:00:00+07:00', 'XClub Arena',
   'Thai Premier League', 'home', 'upcoming', null, null,
   array['#0B6B3A', '#052E1A']::text[], '#F4C430'),
  ('m-cmi', 'Chiang Mai FC', 'CMI', '2026-11-21T19:30:00+07:00', 'XClub Arena',
   'Thai Premier League', 'home', 'upcoming', null, null,
   array['#065F46', '#022C22']::text[], '#34D399'),
  ('m-hkt', 'Phuket United', 'PKT', '2026-11-28T17:00:00+07:00', 'XClub Arena',
   'Thai Premier League', 'home', 'upcoming', null, null,
   array['#1E3A8A', '#0B1220']::text[], '#60A5FA'),
  ('m-kkn', 'Khon Kaen Athletic', 'KKA', '2026-12-05T20:00:00+07:00', 'XClub Arena',
   'Thai Premier League', 'home', 'upcoming', null, null,
   array['#7C2D12', '#1C0A04']::text[], '#FB923C'),
  ('m-ryg', 'Rayong City', 'RYG', '2026-10-25T18:00:00+07:00', 'XClub Arena',
   'Thai Premier League', 'home', 'completed', 1, 0,
   array['#334155', '#0F172A']::text[], '#94A3B8'),
  ('m-npt', 'Nakhon Pathom', 'NPT', '2026-10-18T19:00:00+07:00', 'XClub Arena',
   'Thai Premier League', 'home', 'completed', 2, 2,
   array['#3F3F46', '#18181B']::text[], '#A1A1AA')
on conflict (id) do nothing;

insert into public.zones
  (id, match_id, name, description, price_satang, color, rows, seats_per_row)
values
  ('m-bkk-north', 'm-bkk', 'North Stand', 'Behind the goal · loudest end', 35000, '#22C55E', array['A','B','C','D','E','F']::text[], 12),
  ('m-bkk-east', 'm-bkk', 'East Stand', 'Side view · family friendly', 45000, '#F4C430', array['A','B','C','D','E','F']::text[], 12),
  ('m-bkk-vip', 'm-bkk', 'VIP Pavilion', 'Halfway line · padded seats', 85000, '#8B5CF6', array['A','B','C','D']::text[], 10),
  ('m-cmi-north', 'm-cmi', 'North Stand', 'Behind the goal · loudest end', 35000, '#22C55E', array['A','B','C','D','E','F']::text[], 12),
  ('m-cmi-east', 'm-cmi', 'East Stand', 'Side view · family friendly', 45000, '#F4C430', array['A','B','C','D','E','F']::text[], 12),
  ('m-cmi-vip', 'm-cmi', 'VIP Pavilion', 'Halfway line · padded seats', 85000, '#8B5CF6', array['A','B','C','D']::text[], 10),
  ('m-hkt-north', 'm-hkt', 'North Stand', 'Behind the goal · loudest end', 35000, '#22C55E', array['A','B','C','D','E','F']::text[], 12),
  ('m-hkt-east', 'm-hkt', 'East Stand', 'Side view · family friendly', 45000, '#F4C430', array['A','B','C','D','E','F']::text[], 12),
  ('m-hkt-vip', 'm-hkt', 'VIP Pavilion', 'Halfway line · padded seats', 85000, '#8B5CF6', array['A','B','C','D']::text[], 10),
  ('m-kkn-north', 'm-kkn', 'North Stand', 'Behind the goal · loudest end', 35000, '#22C55E', array['A','B','C','D','E','F']::text[], 12),
  ('m-kkn-east', 'm-kkn', 'East Stand', 'Side view · family friendly', 45000, '#F4C430', array['A','B','C','D','E','F']::text[], 12),
  ('m-kkn-vip', 'm-kkn', 'VIP Pavilion', 'Halfway line · padded seats', 85000, '#8B5CF6', array['A','B','C','D']::text[], 10),
  ('m-ryg-north', 'm-ryg', 'North Stand', 'Behind the goal · loudest end', 35000, '#22C55E', array['A','B','C','D','E','F']::text[], 12),
  ('m-ryg-east', 'm-ryg', 'East Stand', 'Side view · family friendly', 45000, '#F4C430', array['A','B','C','D','E','F']::text[], 12),
  ('m-ryg-vip', 'm-ryg', 'VIP Pavilion', 'Halfway line · padded seats', 85000, '#8B5CF6', array['A','B','C','D']::text[], 10)
on conflict (id) do nothing;

insert into public.seats (id, zone_id, row_label, number, status)
select
  z.id || '-' || r || n,
  z.id,
  r,
  n,
  'available'::public.seat_status
from public.zones z
cross join lateral unnest(z.rows) as r
cross join lateral generate_series(1, z.seats_per_row) as n
on conflict (zone_id, row_label, number) do nothing;

insert into public.news_items
  (id, title, excerpt, body, category, published_at, read_minutes, image_colors)
values
  ('n-matchday', 'Matchday guide: Bangkok Rovers at the Arena',
   'Gates open at 16:30. Here is everything you need for a smooth afternoon in the North Stand.',
   'The XClub Arena gates open two hours before kick-off on Saturday. Supporters are encouraged to arrive early, keep their digital ticket open, and use the East Stand entrance if the North queue is busy.',
   'Club News', '2026-11-04T10:00:00+07:00', 3, array['#0B6B3A', '#022C22']::text[]),
  ('n-report', 'Three points on the road',
   'A second-half header from captain Niran Seetoo settled a scrappy away fixture in Rayong.',
   'XClub returned from the coast with all three points after a disciplined second-half display. The only goal arrived in the 67th minute when Niran Seetoo met a whipped corner at the near post.',
   'Match Report', '2026-10-26T09:30:00+07:00', 4, array['#1E293B', '#0F172A']::text[]),
  ('n-food', 'New East Stand food court opens',
   'Six local vendors, shorter queues, and a dedicated family seating area are ready for Saturday.',
   'The new East Stand food court will open for the first time on Saturday. Six local vendors will serve everything from grilled chicken to boat noodles, with contactless payment at every counter.',
   'Announcement', '2026-10-23T14:00:00+07:00', 2, array['#854D0E', '#422006']::text[]),
  ('n-academy', 'Academy duo sign first professional contracts',
   'Two homegrown midfielders have committed their futures to XClub after standout seasons.',
   'XClub is delighted to announce that academy midfielders Punn and Kiet have signed their first professional contracts.',
   'Club News', '2026-10-20T11:15:00+07:00', 3, array['#065F46', '#022C22']::text[])
on conflict (id) do nothing;

insert into public.gates (id, name, match_id, active)
values
  ('gate-1', 'North Gate', 'm-bkk', true),
  ('gate-2', 'East Gate', 'm-bkk', true),
  ('gate-3', 'VIP Gate', 'm-bkk', true),
  ('gate-4', 'Away Gate', 'm-bkk', true)
on conflict (id) do nothing;

insert into public.app_settings (key, value)
values
  ('club_name', '"XClub"'::jsonb),
  ('club_timezone', '"Asia/Bangkok"'::jsonb),
  ('currency', '"thb"'::jsonb),
  ('max_seats_per_order', '8'::jsonb),
  ('seat_hold_ttl_seconds', '600'::jsonb),
  ('kickoff_lock_minutes', '15'::jsonb),
  ('gate_undo_seconds', '60'::jsonb)
on conflict (key) do nothing;
