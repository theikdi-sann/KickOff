#!/usr/bin/env bash
# P1-23 — deno check every supabase/functions/**/index.ts.
# Exits 0 when the functions tree is empty (nothing to check yet).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
functions_dir="$repo_root/supabase/functions"

if ! command -v deno >/dev/null 2>&1; then
  # CI installs Deno (see .github/workflows/ci.yml). Locally the Supabase CLI
  # bundles a runtime, but a standalone binary may be absent.
  echo "check-functions: deno binary not found on PATH — skipping (CI enforces this check)" >&2
  exit 0
fi

shopt -s nullglob
entries=("$functions_dir"/*/index.ts)
if [ "${#entries[@]}" -eq 0 ]; then
  echo "check-functions: no functions yet — nothing to check"
  exit 0
fi

status=0
for entry in "${entries[@]}"; do
  echo "check-functions: deno check $entry"
  if ! deno check --config "$functions_dir/deno.json" "$entry"; then
    status=1
  fi
done

exit "$status"
