# BASELINE — Phase 0 Recon & Inventory

Recorded: 2026-11-09 · branch `master` · commit `8a46ce9`

## Toolchain

| Tool | Version | Note |
|---|---|---|
| Node.js | v26.13.0 | |
| npm | 12.2.2 | npm workspaces only (§0 guardrail 15) |
| Supabase CLI | not installed globally | `npx supabase` resolves v3.0.0 |
| Git | 2.56.0 | remote `git@github.com:theikdi-sann/KickOff.git` |
| Expo Go dev | works via `npx expo start --tunnel` from `apps/mobile` | school Wi-Fi has client isolation; LAN mode impossible |

## Repo inventory

```
kickoff/
├── package.json          root workspace: apps/*, packages/*
├── tsconfig.json         UNTRACKED stray stub, extends expo/tsconfig.base (auto-created
│                         by Expo when started from root). Not referenced by any task; left untracked.
├── PLAN.md               v2 single source of truth (247 tasks + MVP gate)
├── KickOffDocs.md          reference docs
├── apps/
│   ├── admin/  @kickoff/admin   Next.js 16.4.5 App Router, mock store, TS+ESLint ok
│   └── mobile/ @kickoff/mobile  Expo Router SDK 58, mock store, TS+ESLint ok
└── packages/
    └── shared/ @kickoff/shared  types/theme/qr/mock (no test script yet)
```

Workspace scripts:
- `@kickoff/admin`: `dev`, `build`, `start`, `lint` (eslint), `typecheck` (tsc --noEmit)
- `@kickoff/mobile`: `start`, `reset-project` (legacy — G12 removes it), `android`, `ios`, `web`, `lint` (expo lint), `typecheck` (tsc --noEmit)
- `@kickoff/shared`: `typecheck` only (no build/lint/test yet)
- Root: `mobile`, `mobile:web`, `admin`, `typecheck`, `build:admin`

## Baseline command run (2026-11-09)

Executed per `P0-02`:

```
npm ci → ok
npm run typecheck → ok (shared, mobile, admin)
npm run lint --workspace @kickoff/admin → ok
npm run lint --workspace @kickoff/mobile → ok
npm run build:admin → ok (Next.js 16.4.5, Turbopack, 10 routes: /, /_not-found,
  /dashboard, /dashboard/matches, /dashboard/matches/[id], /dashboard/news,
  /dashboard/scan, /dashboard/tickets, /login)
```

**Result: green baseline.** All five steps exited 0 with no type, lint, or build errors.

## Known gaps / risks at baseline

1. **npm audit:** 14 moderate vulnerabilities — all in the dev toolchain (`@typescript-eslint/*` ≥ 6.16.0 → `typescript-estree`/`utils`, via `eslint-plugin-expo`). No runtime vulnerabilities. Resolution deferred so dependency versions stay pinned until the dedicated dep tasks (`P1-14`–`P1-17`).
2. **Stray untracked root `tsconfig.json`** (see inventory) — candidate for deletion during Phase 1 env/config work if nothing references it.
3. **`minimumPrice → Infinity` bug** and **`scripts/reset-project.js`** still present in `apps/mobile` (gap G12, removed by Phase 10b).
4. **No Supabase directory, no migrations, no env template** yet — created in Phase 1.
5. **Supabase CLI not globally installed** — will be added as a scoped dependency in Phase 1.
6. **No test harness anywhere** (Vitest/pgTAP/Deno/Maestro all absent) — introduced in Phase 1.
7. Mobile dev startup quirk documented for the team: `npm run mobile -- --tunnel` fails (`EUNKNOWNCONFIG`, npm swallows `--tunnel`); always use `cd apps/mobile && npx expo start --tunnel`.
