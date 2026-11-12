#!/usr/bin/env bash
# theme-pass.sh — the theme pipeline's driver (PLAN 9.45, docs/themes/PIPELINE.md, D29, D31).
# Usage: scripts/icefin/theme-pass.sh <command> <theme> [args]
#   start  <theme>               worktree ../icefin-wt-<theme> on theme/<theme>, with main merged in (stage 1)
#   walk   <theme> [walk args]   update the player, walk every screen on the workstation, keep the coverage (stages 2, 6)
#                                (walk args go to tests/icefin/web/theme_walk.py: --only ids,groups  --screen)
#   report [<theme>]             regenerate docs/themes/coverage/ in the theme's worktree (or here)
#   merge  <theme> <task>        push theme/<theme> and open its pull request from merge/<theme>-<task> (stage 7)
#   done   <theme>               the pass is merged: take it off 'active', name the next in the queue (stage 8)
#   status                       the queue, and every theme: its branch against main, its worktree, its last walk
# One theme at a time (the user, 2026-11-12): start refuses while another theme is active, unless --force.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAIN_CHECKOUT="$(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
PARENT="$(dirname "$MAIN_CHECKOUT")"
die() { echo "theme-pass: $*" >&2; exit 1; }
CFG="$ROOT/scripts/icefin/theme-pipeline.json"
cfg() { python3 -c "import json,sys; print(' '.join(json.load(open('$CFG')).get(sys.argv[1], [])))" "$1"; }
themes() { local c; c=" $(cfg control) "; for d in "$ROOT"/themes/*/; do [ -f "$d/theme.json" ] || continue; case "$c" in *" $(basename "$d") "*) ;; *) basename "$d" ;; esac; done; }
# the worktree that has theme/<id> checked out, wherever it is; a new one goes to ../icefin-wt-<id>
wt_of() {
  local w; w="$(git -C "$ROOT" worktree list --porcelain | awk -v b="refs/heads/theme/$1" '/^worktree /{w=$2} $0=="branch " b {print w; exit}')"
  echo "${w:-$PARENT/icefin-wt-$1}"
}
check_theme() { [ -n "${1:-}" ] || die "name a theme: $(themes | tr '\n' ' ')"; case " $(themes | tr "\n" " ") " in *" $1 "*) ;; *) die "no theme '$1' (themes/: $(themes | tr "\n" " "))" ;; esac; }
port_of() { local i=0 t; for t in $(themes); do [ "$t" = "$1" ] && { echo $((9391 + i)); return; }; i=$((i + 1)); done; }

cmd="${1:-}"; shift || true
case "$cmd" in
start)
  t="${1:-}"; check_theme "$t"; wt="$(wt_of "$t")"
  others="$(for x in $(cfg active); do [ "$x" != "$t" ] && echo "$x"; done | tr '\n' ' ')"
  if [ -n "$others" ] && [ "${2:-}" != "--force" ]; then die "one theme at a time: ${others}is in its pass (theme-pass.sh done <theme> when merged; --force only on the user's word)"; fi
  python3 - "$CFG" "$t" <<'PY'
import json, sys
p, t = sys.argv[1], sys.argv[2]
c = json.load(open(p))
if t not in c["active"]:
    c["active"].append(t)
c["queue"] = [x for x in c["queue"] if x != t]
open(p, "w").write(json.dumps(c, indent=2) + "\n")
PY
  git -C "$ROOT" fetch -q origin
  if [ ! -d "$wt" ]; then
    if git -C "$ROOT" show-ref -q "refs/heads/theme/$t"; then git -C "$ROOT" worktree add -q "$wt" "theme/$t"
    elif git -C "$ROOT" show-ref -q "refs/remotes/origin/theme/$t"; then git -C "$ROOT" worktree add -q -b "theme/$t" "$wt" "origin/theme/$t"
    else git -C "$ROOT" worktree add -q -b "theme/$t" "$wt" origin/main; fi
  fi
  cd "$wt"
  [ -z "$(git status --porcelain)" ] || die "$wt has uncommitted changes; commit or stash them first"
  [ "$(git branch --show-current)" = "theme/$t" ] || die "$wt is on $(git branch --show-current), not theme/$t"
  git rev-parse -q --verify "origin/theme/$t" >/dev/null && git merge -q --ff-only "origin/theme/$t" 2>/dev/null || true
  behind="$(git rev-list --count HEAD..origin/main)"
  if [ "$behind" -gt 0 ]; then
    git merge -q --no-ff -m "Merge main into theme/$t" origin/main || die "merging main into theme/$t conflicts: resolve in $wt, then commit"
    echo "theme-pass: merged $behind commit(s) of main into theme/$t"
  fi
  git submodule update -q --init 2>/dev/null || true
  echo "theme-pass: theme/$t ready in $wt ($(git rev-parse --short HEAD)); next: theme-pass.sh walk $t"
  ;;
walk)
  t="${1:-}"; check_theme "$t"; shift
  wt="$(wt_of "$t")"; [ -d "$wt" ] || wt="$ROOT"
  stamp="$(date +%Y%m%d-%H%M%S)"; out="$wt/build-walk/$t/$stamp"
  mkdir -p "$out"
  echo "theme-pass: walking $t from $wt/themes (results: $out)"
  rc=0
  python3 "$ROOT/tests/icefin/web/theme_walk.py" --theme "$t" --themes "$wt/themes" --port "$(port_of "$t")" --out "$out" "$@" || rc=$?
  if python3 -c "import json,sys; sys.exit(0 if json.load(open('$out/coverage.json'))['entries'] else 1)" 2>/dev/null; then
    python3 "$ROOT/scripts/icefin/theme-coverage.py" --root "$wt" --import "$out/coverage.json"
    ln -sfn "$stamp" "$wt/build-walk/$t/latest"
    echo "theme-pass: contact sheet $out/index.html; gap list $wt/docs/themes/coverage/$t.md"
  else
    echo "theme-pass: the walk recorded nothing (see $out/app.log); coverage not kept" >&2; rc=1
  fi
  exit "$rc"
  ;;
report)
  t="${1:-}"; wt="$ROOT"; [ -n "$t" ] && { check_theme "$t"; [ -d "$(wt_of "$t")" ] && wt="$(wt_of "$t")"; }
  python3 "$ROOT/scripts/icefin/theme-coverage.py" --root "$wt"
  ;;
merge)
  t="${1:-}"; task="${2:-}"; check_theme "$t"; [ -n "$task" ] || die "name the PLAN task: theme-pass.sh merge $t <task>"
  wt="$(wt_of "$t")"; [ -d "$wt" ] || die "no worktree for $t (theme-pass.sh start $t)"
  cd "$wt"
  [ -z "$(git status --porcelain)" ] || die "$wt has uncommitted changes"
  git fetch -q origin
  [ "$(git rev-list --count HEAD..origin/main)" -eq 0 ] || die "main moved on: theme-pass.sh start $t (merges it in), walk again, then merge"
  git push -q origin "theme/$t"
  head="merge/$t-$task"
  git push -q -f origin "HEAD:refs/heads/$head"
  name="$(python3 -c "import json; print(json.load(open('themes/$t/theme.json'))['name'])")"
  ver="$(python3 -c "import json; print(json.load(open('themes/$t/theme.json'))['version'])")"
  body="$(mktemp)"
  { echo "Theme pass for $name $ver (PLAN $task), from \`theme/$t\` (D29, \`docs/themes/PIPELINE.md\`)."
    echo
    echo "**Merge with a merge commit, not a squash**, so \`theme/$t\` keeps going without conflicts. This head (\`$head\`) is a throwaway copy of \`theme/$t\`: the repository deletes a pull request's head on merge."
    echo
    [ -f "docs/themes/coverage/$t.md" ] && sed -n '5,7p' "docs/themes/coverage/$t.md"
    echo
    echo "🤖 Generated with [Claude Code](https://claude.com/claude-code)"; } > "$body"
  gh pr create --base main --head "$head" --title "$name $ver: theme pass ($task)" --body-file "$body"
  rm -f "$body"
  ;;
done)
  t="${1:-}"; check_theme "$t"
  python3 - "$CFG" "$t" <<'PY'
import json, sys
p, t = sys.argv[1], sys.argv[2]
c = json.load(open(p))
c["active"] = [x for x in c["active"] if x != t]
c["done"] = [x for x in c["done"] if x != t] + [t]
open(p, "w").write(json.dumps(c, indent=2) + "\n")
print(f"theme-pass: {t} done; active: {', '.join(c['active']) or 'none'}; next in the queue: {c['queue'][0] if c['queue'] else 'none'}")
PY
  ;;
status)
  echo "active: $(cfg active)   next: $(cfg queue)   done: $(cfg done)   control (not refined): $(cfg control)"
  git -C "$ROOT" fetch -q origin
  printf '%-13s %-8s %-8s %-38s %s\n' theme ahead behind worktree "last walk"
  for t in $(themes); do
    ref="origin/theme/$t"; git -C "$ROOT" show-ref -q "refs/remotes/$ref" || ref=""
    a="-"; b="-"; [ -n "$ref" ] && { a="$(git -C "$ROOT" rev-list --count "origin/main..$ref")"; b="$(git -C "$ROOT" rev-list --count "$ref..origin/main")"; }
    wt="$(wt_of "$t")"; [ -d "$wt" ] || wt="-"
    cov="${wt%/}/docs/themes/coverage/$t.json"; [ -f "$cov" ] || cov="$ROOT/docs/themes/coverage/$t.json"
    last="$( [ -f "$cov" ] && python3 -c "import json; r=json.load(open('$cov'))['run']; s=r.get('summary',{}); print(r.get('started','')[:16], f\"{s.get('theme',0)}/{s.get('entries',0)} themed, {s.get('gaps',0)} gaps\")" || echo "not walked")"
    printf '%-13s %-8s %-8s %-38s %s\n' "$t" "$a" "$b" "${wt/#$PARENT\//}" "$last"
  done
  ;;
*) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
