#!/usr/bin/env bash
# hook-count.sh — count and check ICEFIN-HOOK lines in upstream files (PLAN 1.4). Git only, host-safe.
# Usage: scripts/icefin/hook-count.sh [BASE_REF] [--summary FILE]
#   Upstream file = a file that exists in BASE_REF (default icefin/base, else origin/icefin/base).
#   Rule: every line Icefin adds to an upstream file carries "ICEFIN-HOOK: <reason>", or sits directly
#   below an added comment line that does (for formats without trailing comments, e.g. .gitignore, JSON-free text).
#   Exempt: README.md, which Icefin replaces wholesale on purpose (upstream is credited inside it).
#   Exit 1 if any added line is unmarked. Prints totals; --summary appends a Markdown table (CI step summary).
set -euo pipefail
cd "$(dirname "$0")/../.."
base="${1:-}"; summary=""
[ "${1:-}" = --summary ] && base=""
[ "${2:-}" = --summary ] && summary="${3:-}"; [ "${1:-}" = --summary ] && summary="${2:-}"
if [ -z "$base" ]; then
  for r in icefin/base origin/icefin/base; do git rev-parse -q --verify "$r^{commit}" >/dev/null && { base="$r"; break; }; done
fi
[ -n "$base" ] || { echo "hook-count: no base ref (fetch icefin/base)" >&2; exit 2; }

git diff -U0 --no-color --diff-filter=M "$base" HEAD -- . ":(exclude)README.md" | awk -v base="$base" -v summary="$summary" '
  /^\+\+\+ b\// { file = substr($0, 7); prevmark = 0; next }
  /^--- / { next }
  /^@@/ { prevmark = 0; next }
  /^-/ { del[file]++; tdel++; touched[file] = 1; next }
  /^\+/ {
    touched[file] = 1; add[file]++; tadd++
    line = substr($0, 2)
    if (line ~ /ICEFIN-HOOK/) { hook[file]++; thook++; prevmark = 1; next }
    if (prevmark) { cov[file]++; prevmark = 0; next }
    bad[file]++; tbad++; badl[tbad] = file ": " line; next
  }
  END {
    n = 0; for (f in touched) n++
    printf "hook-count: %d upstream files touched vs %s; %d lines added (%d marked, %d covered by a marker line above), %d removed\n", n, base, tadd, thook, tadd - thook - tbad, tdel
    for (f in touched) printf "  %-48s +%d -%d  hooks %d%s\n", f, add[f], del[f], hook[f], (bad[f] ? "  UNMARKED " bad[f] : "")
    if (summary != "") {
      print "## ICEFIN-HOOK count" >> summary
      printf "%d upstream files, %d added lines, %d marked, %d removed, %d unmarked\n\n| File | + | - | hooks | unmarked |\n|---|---|---|---|---|\n", n, tadd, thook, tdel, tbad >> summary
      for (f in touched) printf "| `%s` | %d | %d | %d | %d |\n", f, add[f], del[f], hook[f], bad[f] >> summary
    }
    if (tbad) { print "hook-count: FAIL, unmarked lines in upstream files:"; for (i = 1; i <= tbad && i <= 20; i++) print "  " badl[i]; exit 1 }
    print "hook-count: OK"
  }'
