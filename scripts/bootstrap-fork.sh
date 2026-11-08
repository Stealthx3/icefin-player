#!/usr/bin/env bash
# bootstrap-fork.sh — bring upstream jellyfin-desktop v2.0.0 into this folder (PLAN task 1.1).
# Git only: clones nothing into the host system and builds nothing, so it is safe to run on the host.
# Idempotent: re-running after success only reports state.
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/jellyfin/jellyfin-desktop.git}"
BASE_TAG="v2.0.0"
BASE_COMMIT_PREFIX="1634d3d"
MAIN_BRANCH="icefin/main"
BASE_BRANCH="icefin/base"

cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo "git not found" >&2; exit 1; }

# Icefin files that must survive the checkout. None of these paths exist in upstream v2.0.0.
OURS=(CLAUDE.md docs ai-assets scripts pdf)
for p in README.md .gitignore .gitmodules CMakeLists.txt src native; do
  if [ -e "$p" ] && ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Refusing: '$p' already exists and would collide with upstream. Move it first." >&2; exit 1
  fi
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  git init -q
  echo "Initialized repository."
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch --tags upstream

commit="$(git rev-list -n1 "$BASE_TAG")"
case "$commit" in
  "$BASE_COMMIT_PREFIX"*) echo "Tag $BASE_TAG = $commit (verified)";;
  *) echo "Tag $BASE_TAG resolves to $commit, expected $BASE_COMMIT_PREFIX… — stop and check upstream." >&2; exit 1;;
esac

if git show-ref --verify --quiet "refs/heads/$MAIN_BRANCH"; then
  echo "$MAIN_BRANCH already exists; nothing to do."
else
  # Untracked Icefin files do not collide with upstream paths, so checkout keeps them in place.
  git checkout -q -b "$MAIN_BRANCH" "$BASE_TAG"
  git branch -f "$BASE_BRANCH" "$BASE_TAG"
  echo "Checked out $BASE_TAG as $MAIN_BRANCH; $BASE_BRANCH points at the same commit."
fi

# Submodules (external/mpvqt from invent.kde.org). Re-run this script if it fails on network errors.
if git submodule update --init --recursive; then
  echo "Submodules ready."
else
  echo "WARNING: submodule checkout failed (network?). Re-run this script before building." >&2
fi

echo
echo "Next: review, then commit the planning files on $MAIN_BRANCH:"
echo "  git add ${OURS[*]} && git commit -m 'Add Icefin Player planning docs and standards'"
echo "Then create the feature stack (PLAN 1.2): brand, flatpak, audio, gpu, render, hdr, input, theme."
