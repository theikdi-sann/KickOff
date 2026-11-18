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
| Black + royal blue (primary) | `primary`, `primaryBright`, `primaryDark`, `primaryDeep` |
| Trophy gold (accent) | `accent`, `accentDeep`, `accentSoft`, `goldInk` |
| Neutrals | `ink`, `inkMuted`, `muted`, `mutedGreen`, `surface`, `surfaceAlt`, `card`, `border` |
| App chrome | `appBackground`, `line`, `softGreen`, `softGold`, `shadow` |
| Night / dark surfaces | `night`, `nightMid`, `nightCard`, `nightBorder`, `nightText`, `nightMuted` |
| Status | `danger`, `warning` |

### Current palette

**Black and gold, with royal blue as the only cool accent.** Gold is never
body text on a light surface; it is a fill, a border, or text on black (13:1).
Blue carries links and secondary emphasis on white (8.8:1).

| Token | Value | Role |
|---|---|---|
| `primary` | `#000000` | Primary action, active navigation, crest base |
| `primaryBright` | `#184794` | Links, secondary actions, crest highlight |
| `primaryDark` | `#0B1B33` | Gradient anchor, icons on light, pressed state |
| `primaryDeep` | `#07101F` | Deepest surface, full-bleed overlays |
| `accent` | `#FFCA6F` | Highlights, badges, active tab, hero accents |
| `accentDeep` | `#8A5A00` | Gold-family text/icons on light (6:1 on white) |
| `accentSoft` | `#F6D79A` | Reserved-seat border, soft gold edges |
| `goldInk` | `#6B4A00` | Text on a soft-gold chip (7.2:1) |
| `ink` | `#0A0F1A` | Body text |
| `muted` | `#5B6779` | Secondary text (5.3:1 on `surfaceAlt`) |
| `appBackground` | `#F1F5F9` | App and console canvas |
| `surfaceAlt` | `#F1F5F9` | Inset panels, muted chips |
| `softGreen` | `#E8EFFB` | Soft info/positive chip (legacy key name, now blue) |
| `softGold` | `#FFF1D9` | Gold chip surface |
| `night` | `#070C17` | Tab bar, heroes, dark chrome |
| `nightMuted` | `#A9B6CC` | Inactive tab, dark-surface captions |
| `danger` | `#DC2626` | Destructive and error |
| `warning` | `#B45309` | Deadline/attention text on light (5:1) |

`THEME-1` in `packages/shared/src/__tests__/theme.test.ts` re-checks every
text pair above at WCAG AA or better, and `THEME-2` fails if a token is added
without its `--brand-*` CSS variable.

The **artwork is not part of the palette**: the PNGs are matted on the navy
field `#14243D`, so a palette change leaves the crest untouched. Repainting
the art is a separate regeneration job (see *Rules*).

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
3. Run `npm run check` and the shared tests — `THEME-1` rejects any text pair
   that drops below 4.5:1. No other file should need editing.
4. `apps/admin/src/components/zone-create-form.tsx` has one `#0EA5E9`
   default; that is a *user-chosen* zone colour, not a brand colour.

### Rules

- Never hardcode a brand hex in a component. Use `colors.*` (mobile),
  a Tailwind `bg-*`/`text-*` token (admin), or `brand.*` (shared).
- Non-brand hexes are allowed where they are semantic, not brand:
  `#FEE2E2`/`#FECACA`/`#FEF2F2` (danger surfaces), `#635BFF` (Stripe),
  `#334155`/`#1E293B` (used/neutral ticket state). Chrome that used to be a
  literal green-grey now reads the palette: the unavailable seat is
  `colors.line` and the inactive tab is `colors.nightMuted`.
- Brand art is the KickOff lockup: a match ball breaking through a ticket
  and a pitch outline, over the navy field `#14243D`. It ships in two forms —
  the full lockup (`splash-icon.png`, crest plus `KICK OFF` wordmark) and the
  crest alone (`brand-mark.png`), which every other mark derives from.
- The store tile (`icon.png`) is 1024×1024 and opaque: the platforms mask the
  corners, so a transparent icon is rejected. The adaptive foreground, the
  monochrome layer and the favicons keep transparency.
- The artwork itself lives in `apps/mobile/assets/brand/kickoff-logo.png`
  (outside `assets/images`, which holds only what ships).
- Regenerating an asset means regenerating from the artwork, not editing a
  derived file: the alpha is matted against the navy field, then each size is
  composited on that field and quantised to a palette. `BRAND-1…BRAND-5` pin
  the paths, the 1024 square, the transparency split and the size budget.

## Marks

All three render the crest from `apps/mobile/assets/images/brand-mark.png`
(served as `/brand-mark.png` in the admin console) instead of a letter tile:

- **Admin logo** (`apps/admin/src/components/logo.tsx`): crest, `KICKOFF`
  wordmark, `Matchday operations` descriptor.
- **Mobile splash** (`apps/mobile/src/app/_layout.tsx` → `BrandSplash`):
  crest, `KICKOFF`, `MATCHDAY, SIMPLIFIED`.
- **Welcome hero** (`apps/mobile/src/app/(auth)/welcome.tsx`): crest,
  `KICKOFF`, `EST. 2026 · BANGKOK`.
- **Crests / avatars**: two-letter `KO` for the club; opponents use
  `opponentShort`; the club crest gradient is
  `[colors.primaryBright, colors.primaryDark]`.

## Voice

- Matchday, tickets, gates, kicks off — not "events", "vouchers", "entries".
- Prices are displayed in the club's currency — THB is the brand default,
  shown with the `฿` symbol — and stored as integer minor units
  (`formatMoney` in `packages/shared/src/money.ts`).
- Legal/copy lives in `apps/mobile/src/app/legal/[doc].tsx` and the mobile
  README; the admin console copy lives in each dashboard page.
