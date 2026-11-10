#!/usr/bin/env bash
# theme-lint.sh: the theme engine must stay theme-agnostic (CLAUDE.md hard rule, DECISIONS D3).
#  1. Engine code never names a theme: no theme id from themes/*/theme.json or tests/icefin/themes/*/theme.json.
#  2. Engine code holds no theme values: no color literals (#hex, rgb()/rgba()/hsl()/hsla() with numbers).
#  3. Shipped theme files name no other product (CLAUDE.md hard rule: Icefin branding everywhere). Benchmark targets
#     are named in docs/PLAN.md and docs/SPEC.md only.
# Engine code: src/icefin/theme/, native/icefin/, qml/icefin/. Exit 1 on a finding.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENGINE=()
for d in src/icefin/theme native/icefin qml/icefin; do [ -d "$d" ] && ENGINE+=("$d"); done
[ ${#ENGINE[@]} -gt 0 ] || { echo "theme-lint: no engine code yet"; exit 0; }
bad=0
ids="$(for f in themes/*/theme.json tests/icefin/themes/*/theme.json; do [ -f "$f" ] && python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$f"; done | sort -u | grep -v '^$' || true)"
for id in $ids; do
  if hits="$(grep -rnwF -- "$id" "${ENGINE[@]}")"; then echo "theme-lint: engine code names theme '$id':"; echo "$hits"; bad=1; fi
done
if hits="$(grep -rnE -- '#[0-9a-fA-F]{3,8}\b|(rgba?|hsla?)\(\s*[0-9]' "${ENGINE[@]}" | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*|#)' || true)" && [ -n "$hits" ]; then
  echo "theme-lint: color literals in engine code (themes hold values; the engine uses tokens):"; echo "$hits"; bad=1
fi
PRODUCTS='xbox|wii|nintendo|microsoft|roku|fire ?tv|amazon|kodi|estuary|apple|tvos|plex|emby|playstation|ps3|xmb|sony|android tv|google tv|webos|tizen|netflix|tivo|valve|steam ?big ?picture|steam ?deck'
if hits="$(grep -rniE -- "\\b($PRODUCTS)\\b" themes/ || true)" && [ -n "$hits" ]; then
  echo "theme-lint: product names in shipped theme files (name targets in docs/PLAN.md, not in themes/):"; echo "$hits"; bad=1
fi
[ $bad = 0 ] && echo "theme-lint: OK ($(wc -w <<<"$ids") theme id(s) checked against ${ENGINE[*]})"
exit $bad
