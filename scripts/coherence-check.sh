#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# coherence-check.sh — encode positioning/claim coherence as an automated gate.
#
# Turns "are the changes coherent?" into measurable invariants. Run before every
# deploy (add to `preflight`). Exits non-zero on any failure so CI blocks a
# release that reintroduces an inconsistency.
#
# Layers checked (objective ones only — schema/visible-content and narrative
# coherence still need Google Rich Results Test + a blind LLM read, run by hand):
#   1. Message   — no retired framing on live surfaces
#   2. Claim     — one canonical customer endpoint; correct API-key prefix
#   3. Structure — every indexable page has a meta description
#   4. Sitemap   — key pages are present
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

fail=0
pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31mFAIL\033[0m %s\n" "$1"; fail=1; }

# Live, indexable surfaces only (exclude historical blog posts + tests).
LIVE_GLOBS=(src public/llms.txt content/docs)

echo "── 1. Message coherence (retired framing) ──"
resid=$(grep -rniE "second brain|digital brain" "${LIVE_GLOBS[@]}" 2>/dev/null | grep -viE "\.test\.|\.spec\." | wc -l | tr -d ' ')
[ "$resid" = "0" ] && pass "no 'second brain / digital brain' on live surfaces" \
                    || bad "$resid retired-framing reference(s) still live"

echo "── 2. Claim coherence (endpoint + key prefix) ──"
ep=$(grep -rnE "parametric-memory\.dev/mcp" src content 2>/dev/null | grep -viE "\.test\." | wc -l | tr -d ' ')
[ "$ep" = "0" ] && pass "customer MCP endpoint is canonical (droplet-mcp.nz)" \
               || bad "$ep reference(s) to the wrong endpoint domain (parametric-memory.dev/mcp)"

mmk=$(grep -rnE "mmk_" src content 2>/dev/null | grep -viE "\.test\.|not\.toContain" | wc -l | tr -d ' ')
[ "$mmk" = "0" ] && pass "API-key prefix is mmpm_ everywhere (no stale mmk_)" \
                 || bad "$mmk stale mmk_ key-prefix reference(s)"

echo "── 3. Structure coherence (indexable pages have a description) ──"
missing=""
while IFS= read -r p; do
  grep -q "index: false\|noindex" "$p" && continue      # private pages are exempt
  grep -q "redirect(" "$p" && continue                  # redirect stubs inherit the target's metadata
  case "$p" in *"/admin/"*|*"/auth/"*|*"/billing/"*) continue;; esac
  grep -q "description:" "$p" || missing="$missing $p"
done < <(find src/app -name page.tsx)
[ -z "$missing" ] && pass "every indexable page.tsx has a description" \
                  || bad "missing description:$missing"

echo "── 4. Sitemap coherence ──"
grep -q "/benchmark" src/app/sitemap.ts && pass "/benchmark is in the sitemap" \
                                        || bad "/benchmark missing from sitemap"

echo
if [ "$fail" = "0" ]; then
  printf "\033[32mCOHERENCE OK\033[0m — automated invariants hold.\n"
  echo "Still run by hand: Google Rich Results Test (schema↔content), Lighthouse SEO, GSC live render, and a blind LLM 'what does this company do?' read."
else
  printf "\033[31mCOHERENCE FAILED\033[0m — fix the above before deploy.\n"
fi
exit $fail
