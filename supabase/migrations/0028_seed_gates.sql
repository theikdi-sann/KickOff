-- 0028_seed_gates — the four stadium entrances used by the demo and tests.
-- Seeded in a migration (not only `seed.sql`) so `db push` creates them on an
-- existing project; `seed.sql` keeps the same rows idempotent for `db reset`.
--
-- Migrations run before `seed.sql`, so the referenced fixture may not exist on
-- a fresh database. In that case this insert is a no-op and `seed.sql` creates
-- the gates after it has created the matches.
insert into public.gates (id, name, match_id, active)
select id, name, match_id, active
from (
  values
    ('gate-1', 'North Gate', 'm-bkk', true),
    ('gate-2', 'East Gate', 'm-bkk', true),
    ('gate-3', 'VIP Gate', 'm-bkk', true),
    ('gate-4', 'Away Gate', 'm-bkk', true)
) as seed(id, name, match_id, active)
where exists (select 1 from public.matches where id = 'm-bkk')
on conflict (id) do nothing;
