// Phase B — punch list #12: proper venues/stadiums schema (full
// normalization) + admin venue management.
//
// matches.venue was free text read in ~10 places (mapper, two SQL views,
// mobile/admin selects, the tickets embed, seed, mvp-gate). Locks in:
//   1. the migration creates venues, backfills from the text column,
//      sets matches.venue_id NOT NULL and drops matches.venue,
//   2. RLS: venues are public-read / admin-write,
//   3. read paths join venues (mapper derives the DTO venue name from the
//      embedded row, not a text column that no longer exists),
//   4. seed and mvp-gate still create fixtures (venue_id default),
//   5. admin has a venue management page backed by real queries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const migration = () => {
  const files = read('supabase/migrations/0035_venues.sql');
  return files;
};

test('VEN-1 migration creates venues, backfills, and drops the free-text column', () => {
  const sql = migration();

  assert.match(sql, /create table public\.venues/, 'a venues table must be created');
  assert.match(
    sql,
    /insert into public\.venues[\s\S]*?select distinct venue from public\.matches/i,
    'existing venue text must be backfilled into venues rows',
  );
  assert.match(
    sql,
    /alter table public\.matches[\s\S]{0,200}?venue_id[\s\S]{0,80}?set not null/i,
    'matches.venue_id must end up NOT NULL',
  );
  assert.match(
    sql,
    /alter table public\.matches drop column venue/i,
    'the free-text matches.venue column must be dropped — venues is the single source of truth',
  );
  assert.match(
    sql,
    /references public\.venues/i,
    'matches.venue_id must be a foreign key to venues',
  );
});

test('VEN-2 venues RLS is public-read / admin-write', () => {
  const sql = migration();

  assert.match(
    sql,
    /alter table public\.venues enable row level security/,
    'RLS must be enabled on venues',
  );
  assert.match(
    sql,
    /venues_public_read[\s\S]{0,160}?to anon, authenticated using \(true\)/,
    'anyone reading the catalogue must be able to read venues',
  );
  assert.match(
    sql,
    /venues_admin_write[\s\S]{0,160}?is_admin\(\)/,
    'only admins may write venues',
  );
});

test('VEN-3 matches default to the seeded home venue so bare inserts keep working', () => {
  const sql = migration();

  assert.match(
    sql,
    /alter table public\.matches alter column venue_id set default/i,
    'venue_id needs a default so mvp-gate and plain inserts do not fail',
  );
  assert.match(
    sql,
    /KickOff Arena/,
    'the migration must seed the home venue row the default points at',
  );
});

test('VEN-4 read paths join venues instead of a text column', () => {
  const mapper = read('packages/shared/src/mappers.ts');
  const mobileMatches = read('apps/mobile/src/lib/queries/matches.ts');
  const adminMatches = read('apps/admin/src/lib/queries/matches.ts');
  const mobileTickets = read('apps/mobile/src/lib/queries/tickets.ts');
  const views = read('supabase/migrations/0036_venue_views.sql');

  // The DTO keeps venue: string (the *name*), sourced from the embedded row.
  assert.match(
    mapper,
    /venues\??\.(?:name)|row\.venues/,
    'toMatchDto must derive the venue name from the embedded venues row',
  );
  assert.doesNotMatch(
    mapper,
    /venue: row\.venue,/,
    'the mapper must no longer read a venue text column',
  );
  assert.match(
    mobileMatches,
    /venues\(name\)/,
    'the mobile match queries must embed venues(name)',
  );
  assert.match(
    adminMatches,
    /venues\(name\)/,
    'the admin match queries must embed venues(name)',
  );
  assert.match(
    mobileTickets,
    /venue:venues\(name\)|venues\(name\)/,
    'the tickets embed must source the venue name through venues',
  );
  assert.match(
    views,
    /join public\.venues/,
    'the recreated view must join venues for the venue column',
  );
  assert.match(
    views,
    /order_receipt_view/,
    'order_receipt_view (the only venue-dependent view) must be recreated against venues',
  );
});

test('VEN-5 seed and mvp-gate still create fixtures against the schema', () => {
  const seed = read('supabase/seed.sql');
  const gate = read('scripts/mvp-gate.mjs');

  assert.match(
    seed,
    /insert into public\.venues/,
    'seed.sql must seed the venues rows before matches reference them',
  );
  // mvp-gate inserts a match with no venue — allowed only via the default.
  assert.match(
    read('supabase/migrations/0035_venues.sql'),
    /set default/,
    'a venue_id default is what keeps the bare mvp-gate insert working',
  );
  assert.doesNotMatch(
    gate,
    /venue:/,
    'mvp-gate must not need venue text — it relies on the column default',
  );
});

test('VEN-6 admin has a venue management page backed by real queries', () => {
  const page = read('apps/admin/src/app/dashboard/venues/page.tsx');
  const queries = read('apps/admin/src/lib/queries/venues.ts');
  const nav = read('apps/admin/src/app/dashboard/layout.tsx');

  assert.match(page, /useVenues\(/, 'the page must list venues through useVenues');
  assert.match(page, /useCreateVenue|useSaveVenue/, 'the page must create venues');
  assert.match(page, /useDeleteVenue/, 'the page must delete venues');
  assert.match(
    queries,
    /from\("venues"\)/,
    'venue queries must hit the venues table',
  );
  assert.match(queries, /useCreateVenue/, 'a create-venue mutation must exist');
  assert.match(queries, /useDeleteVenue/, 'a delete-venue mutation must exist');
  assert.match(nav, /\/dashboard\/venues/, 'the admin nav must link the venues page');
});

test('VEN-8 edge functions never select the dropped venue column', () => {
  const ticketView = read('supabase/functions/_shared/ticket-view.ts');
  const checkout = read('supabase/functions/stripe-checkout/index.ts');
  const reminders = read('supabase/functions/send-kickoff-reminders/index.ts');

  // PostgREST would 400 on `venue` once matches.venue is dropped — both
  // functions must source the name through the venues embed instead.
  assert.match(
    ticketView,
    /venue:venues\(name\)|venues\(name\)/,
    'the ticket view embed must source the venue through venues',
  );
  assert.doesNotMatch(
    ticketView,
    /matches\(opponent,kickoff_at,venue\)/,
    'the raw venue column must not be selected from matches any more',
  );
  // stripe-checkout selected venue but never read it — the column simply
  // goes away from its select (no embed needed for unused data).
  assert.doesNotMatch(
    checkout,
    /select\("opponent,kickoff_at,venue"\)/,
    'stripe-checkout must no longer select the dropped column',
  );
  assert.doesNotMatch(
    checkout,
    /,venue[,)]/,
    'stripe-checkout must not reference the dropped venue column at all',
  );
  // The reminder body reads `match.venue` — it must embed venues and take
  // the name from the embedded row, or every scheduled reminder 400s.
  assert.match(
    reminders,
    /venues\(name\)/,
    'send-kickoff-reminders must embed venues for its message body',
  );
  assert.doesNotMatch(
    reminders,
    /kickoff_at,venue\)/,
    'send-kickoff-reminders must not select the raw venue column',
  );
  assert.match(
    reminders,
    /venue\?\.name|venues\?\.name/,
    'the reminder body must read the venue name off the embedded row',
  );
});

test('VEN-7 the admin match form picks a venue instead of free-typing it', () => {
  const form = read('apps/admin/src/components/match-form.tsx');

  assert.match(form, /useVenues\(/, 'the form must load venues for the picker');
  assert.match(form, /<select[\s\S]{0,200}venue/i, 'venue must be a select, not a text input');
  assert.doesNotMatch(
    form,
    /placeholder="KickOff Arena"/,
    'the free-text venue input must be gone',
  );
});
