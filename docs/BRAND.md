# BRAND — KickOff

The brand is **KickOff**, a Bangkok football club playing home matches at
**KickOff Arena**. This file documents where the brand lives in code and how
to change it.

## Identity

| Token | Value |
|---|---|
| Product / club name | **KickOff** |
| Stadium / venue | **KickOff Arena** |
| Wordmark | `KICKOFF` (uppercase, wide tracking) |
| Crest letter | `K` |
| Initials used in avatars & thumbnails | `KO` |
| Deep link scheme | `kickoff://` |
| npm scope | `@kickoff/*` |
| Tagline | `MATCHDAY, SIMPLIFIED` |
| Locale | English only (Thai deferred — see `PLAN.md` `P11-08`) |

## Typography

| Role | Font |
|---|---|
| Display / headings / scores | **Barlow Condensed** (600, 700) |
| Body / UI | **Inter** (400, 500, 700) |

Loaded in `apps/mobile/src/app/_layout.tsx` via `@expo-google-fonts/*` and
exposed as `fonts` from `apps/mobile/src/lib/theme.ts`. The admin console uses
the `.display` class for Barlow Condensed (`apps/admin/src/app/globals.css`).

## Colour — the single source of truth

**Edit `packages/shared/src/theme.ts`. Nothing else defines a brand colour.**

That file exports two things:

- **`brand`** — the raw token object. Every semantic colour is a key on it.
- **`brandCssVariables`** — the same tokens as `--brand-*` CSS custom
  properties, for the admin console.

The palette is deliberately grouped so a re-skin is a find-and-replace in one
file:

| Group | Keys |
|---|---|
| Pitch green (primary) | `primary`, `primaryBright`, `primaryDark`, `primaryDeep` |
| Trophy gold (accent) | `accent`, `accentDeep`, `accentSoft`, `goldInk` |
| Neutrals | `ink`, `inkMuted`, `muted`, `mutedGreen`, `surface`, `surfaceAlt`, `card`, `border` |
| App chrome | `appBackground`, `line`, `softGreen`, `softGold`, `shadow` |
| Night / dark surfaces | `night`, `nightMid`, `nightCard`, `nightBorder`, `nightText`, `nightMuted` |
| Status | `danger`, `warning` |

### How each app consumes it

```
packages/shared/src/theme.ts   (brand, brandCssVariables)
        │
        ├── apps/mobile/src/lib/theme.ts
        │     `colors = { ...brand, bg, text, line, softGreen, softGold }`
        │     plus `fonts`, `radii`, `shadow` — imported as `@/lib/theme`
        │
        ├── apps/admin/src/app/layout.tsx
        │     injects `brandCssVariables` as an inline style on <html>
        │     (className is untouched)
        │           │
        │           └── apps/admin/src/app/globals.css
        │                 `@theme inline` maps every Tailwind `--color-*`
        │                 token to `var(--brand-*)`, so classes like
        │                 `bg-pitch`, `text-gold`, `border-pitch` follow
        │                 the palette automatically
        │
        └── apps/mobile/app.config.ts
              native notification / splash tints
```

### Re-skin checklist

1. Change the hex values in `packages/shared/src/theme.ts`.
2. Keep `brandCssVariables` key-for-key in sync with the `var(--brand-*)`
   names referenced in `apps/admin/src/app/globals.css` (the file header
   reminds you of this).
3. Run `npm run check` — no other file should need editing.
4. `apps/admin/src/components/zone-create-form.tsx` has one `#0EA5E9`
   default; that is a *user-chosen* zone colour, not a brand colour.

### Rules

- Never hardcode a brand hex in a component. Use `colors.*` (mobile),
  a Tailwind `bg-*`/`text-*` token (admin), or `brand.*` (shared).
- Non-brand hexes are allowed where they are semantic, not brand:
  `#FEE2E2`/`#FECACA`/`#FEF2F2` (danger surfaces), `#635BFF` (Stripe),
  `#334155`/`#1E293B` (used/neutral ticket state), `#DDE3DF` (unavailable
  seat), `#7D8F84` (inactive tab).
- Brand assets (`icon.png`, `splash-icon.png`, notification icon) are
  tracked by `P12-03` and still pending final art.

## Marks

- **Logo tile** (`apps/admin/src/components/logo.tsx`): gold tile, `K`
  glyph, `KICKOFF` wordmark, `Matchday operations` descriptor.
- **Mobile splash** (`apps/mobile/src/app/_layout.tsx` → `BrandSplash`):
  green tile, `K` glyph, `KICKOFF`, `MATCHDAY, SIMPLIFIED`.
- **Welcome hero** (`apps/mobile/src/app/(auth)/welcome.tsx`): green tile,
  `K` glyph, `KICKOFF`, `EST. 2026 · BANGKOK`.
- **Crests / avatars**: two-letter `KO` for the club; opponents use
  `opponentShort`; the club crest gradient is
  `[colors.primaryBright, colors.primaryDark]`.

## Voice

- Matchday, tickets, gates, kicks off — not "events", "vouchers", "entries".
- Prices are THB, always displayed with the `฿` symbol, stored as integer
  satang (`packages/shared/src/money.ts`).
- Legal/copy lives in `apps/mobile/src/app/legal/[doc].tsx` and the mobile
  README; the admin console copy lives in each dashboard page.
