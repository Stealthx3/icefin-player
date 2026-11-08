#!/usr/bin/env bash
# restack.sh — keep the Icefin feature stack linear after committing to one layer (git only, host-safe).
# Usage: scripts/icefin/restack.sh [--push]
#   Replays every layer above each changed one, in STACK order, then fast-forwards icefin/main to the top.
#   Workflow: git switch icefin/<layer>; commit; scripts/icefin/restack.sh [--push]
set -euo pipefail
cd "$(dirname "$0")/../.."
STACK=(icefin/base icefin/infra icefin/brand icefin/flatpak icefin/audio icefin/gpu icefin/render icefin/hdr icefin/input icefin/theme)
TOP="${STACK[-1]}"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "restack: commit or stash tracked changes first" >&2; exit 1; }
start="$(git branch --show-current)"
# Walk up: each layer must contain the one below it; if not, rebase it (and everything above) onto it.
for ((i = 1; i < ${#STACK[@]}; i++)); do
  below="${STACK[i-1]}" here="${STACK[i]}"
  git merge-base --is-ancestor "$below" "$here" && continue
  old="$(git merge-base "$below" "$here")"
  echo "restack: $here no longer sits on $below; rebasing $here..$TOP"
  git switch -q "$TOP"
  git rebase -q --update-refs --onto "$below" "$old" "$TOP" || {
    echo "restack: conflict while rebasing; resolve, 'git rebase --continue', then re-run." >&2; exit 1; }
done
git branch -f icefin/main "$TOP"
git switch -q "$start" 2>/dev/null || true
for b in "${STACK[@]:1}"; do printf '  %-16s %s\n' "$b" "$(git log -1 --format='%h %s' "$b" | cut -c1-70)"; done
echo "restack: icefin/main = $TOP ($(git rev-parse --short "$TOP"))"
if [ "${1:-}" = --push ]; then git push -q --force-with-lease origin "${STACK[@]:1}" icefin/main && echo "restack: pushed"; fi
