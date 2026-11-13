#!/usr/bin/env bash
# One-time setup + production deploy for Realframe on Vercel.
# Usage: ANTHROPIC_API_KEY=sk-ant-... ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=stephen-warren-s-projects
SUPABASE_URL=https://sezaqrjqeyrxoeanqbdt.supabase.co
SUPABASE_KEY=sb_publishable_W5zsC0B5N7TEKirdTAHAkQ_c3kdJ3QV

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Set ANTHROPIC_API_KEY first: ANTHROPIC_API_KEY=sk-ant-... ./scripts/deploy.sh" >&2
  exit 1
fi

# Link (creates the "realframe" project on first run).
npx -y vercel@latest link --yes --scope "$SCOPE" --project realframe

add_env() { # name value [sensitive]
  for target in production preview development; do
    if [ "$target" = development ] && [ "${3:-}" = sensitive ]; then continue; fi
    npx -y vercel@latest env rm "$1" "$target" --yes --scope "$SCOPE" >/dev/null 2>&1 || true
    printf '%s' "$2" | npx -y vercel@latest env add "$1" "$target" ${3:+--sensitive} --scope "$SCOPE" >/dev/null
  done
  echo "set $1"
}

add_env NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL"
add_env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$SUPABASE_KEY"
add_env REALFRAME_CODEGEN_MODEL claude-sonnet-5-5
add_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY" sensitive

npx -y vercel@latest deploy --prod --scope "$SCOPE"
