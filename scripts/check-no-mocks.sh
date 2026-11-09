#!/usr/bin/env bash
# P1-26 — guard against the Phase A mock data layer leaking into production code.
# Fails while any mock symbol is still imported/used in the app sources; passes
# once Phase 10 migrates mobile + admin onto Supabase.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Symbols that must disappear from app code (they live in packages/shared/src/mock.ts).
pattern='mockMatches|mockZones|mockNews|seedOrders|seedTickets|minimumPrice|zoneAvailability'

search_paths=(
  "$repo_root/apps/mobile/src"
  "$repo_root/apps/admin/src"
)

matches=0
if command -v rg >/dev/null 2>&1; then
  for dir in "${search_paths[@]}"; do
    [ -d "$dir" ] || continue
    if rg --line-number --no-heading --color never --glob '!**/*.test.ts' \
      --glob '!**/*.test.tsx' -e "$pattern" "$dir"; then
      matches=1
    fi
  done
else
  for dir in "${search_paths[@]}"; do
    [ -d "$dir" ] || continue
    if grep -rnE --exclude='*.test.ts' --exclude='*.test.tsx' "$pattern" "$dir"; then
      matches=1
    fi
  done
fi

if [ "$matches" -ne 0 ]; then
  echo "check-no-mocks: mock-layer symbols still referenced in app sources (expected until Phase 10)." >&2
  exit 1
fi

echo "check-no-mocks: no mock-layer references in app sources"
exit 0
