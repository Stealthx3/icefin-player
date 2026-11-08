# GitHub restructuring: brief for Claude Cowork

_Written 2026-11-08 by Claude Code at commit `1232b3f`. Development is paused until the restructuring is done and
the user says to continue. Read this before changing anything on GitHub._

## Snapshot

| Item | State |
|---|---|
| Repo | `github.com/Stealthx3/icefin-player`, public, default branch `icefin/main`, no branch protection, issues and wiki enabled, no topics, no homepage |
| Remotes (local clone) | `origin` = the repo above (SSH); `upstream` = `jellyfin/jellyfin-desktop`, push disabled |
| Branches on GitHub | `icefin/base` `1634d3d` (upstream v2.0.0) · `infra` `e98273a` · `brand` `822fab6` · `flatpak`, `audio`, `gpu`, `render`, `hdr`, `input` all at `32b3417` · `theme` = `main` = `1232b3f` |
| Tags on GitHub | none (upstream's `v*` tags exist only locally) |
| PRs and issues | none |
| CI on `icefin/main` | `icefin-hooks` ✅ and `icefin-flatpak` ✅ on push and PR; `icefin-rebase-canary` daily 09:17 UTC. Upstream's `main.yml` (branches `release`, `prerelease`, `test`) and `test.yml` (`master`) never trigger here |
| Uncommitted on the user's disk | `docs/github/README.md` (the user's draft GitHub README) and edits to `scripts/bootstrap-fork.sh`. Claude Code leaves both alone |

## Rules the restructuring must keep (CLAUDE.md, DECISIONS)

1. **Keep upstream rebasable.** Icefin code lives only in `src/icefin/`, `native/icefin/`, `qml/icefin/`,
   `external/mpv/`, `flatpak/` and `themes/`. Upstream files get marked one-line hooks only (`ICEFIN-HOOK: <reason>`).
   - Don't move, rename or reformat upstream files (`src/`, `native/`, `resources/`, `CMakeModules/`, `tests/`
     outside `tests/icefin/`, upstream's `.github/workflows/main.yml` and `test.yml`).
   - `README.md` is the one upstream file Icefin replaces wholesale; `scripts/icefin/hook-count.sh` exempts it.
     Any other upstream file you change must pass that script (CI job `icefin-hooks`).
2. **Keep upstream's copyright and license.** GPL-2.0 `LICENSE` stays as is, and Jellyfin Desktop gets credit.
   Never use the Jellyfin name or `org.jellyfin.*` IDs as the app's identity. The app ID is
   `io.github.stealthx3.IcefinPlayer` (D13).
3. **No vendor assets** (logos, icons, sounds, characters, fonts) in the repo, the README, the social preview or the wiki.
   Clone-theme names are Icefin's own (D9). Branding comes from the user's IceSuite folder (D15).
4. **Settled decisions** in `docs/DECISIONS.md` (D1–D16) aren't reopened without the user.

## What depends on today's names and paths

If the restructuring renames branches, moves files or changes the default branch, update these too, or list them
for Claude Code to update:

| Depends on | Where |
|---|---|
| Branch names `icefin/*` and the stack order | `scripts/icefin/restack.sh` (`STACK=`), `docs/BRANCHES.md`, `scripts/icefin/hook-count.sh` (`icefin/base` as diff base), `.github/workflows/icefin-hooks.yml` and `icefin-flatpak.yml` (`branches: ["icefin/main"]`), `icefin-rebase-canary.yml` (`ref: icefin/main`), `scripts/bootstrap-fork.sh` |
| The default branch | the three icefin workflows above; `docs/HANDOFF.md`, `docs/USAGE-PLAN.md` |
| `docs/PLAN.md` path and checkbox format (`- [x] **N.M**`) | `scripts/progress.mjs` and `progress.config.json`, which feed the progress page at claude.ai/artifact/7SXtcWsFr8pe21DfQ4T7TU |
| `docs/postmortem/JOURNAL.md`, `docs/USAGE-PLAN.md`, `docs/LAB.md` | required by the standards in `ai-assets/`, linked from `CLAUDE.md` |
| `CLAUDE.md`, `docs/HANDOFF.md`, `docs/PLAN.md`, `docs/SPEC.md`, `docs/DECISIONS.md` | Claude Code reads them at every session start (the paths are in `CLAUDE.md`) |
| `lab.env`, `lab.htpcsim.env`, `scripts/lab.sh` | VM-LAB-STANDARD expects them at the repo root and in `scripts/` |
| `scripts/icefin/`, `tests/icefin/`, `build-htpc/` (git-ignored via `/build-*`) | HTPC tier and test harness |
| `.claude/` (settings, agents, phone-alert hooks) | Claude Code at runtime |
| `external/mpvqt` (submodule) | the build (`USE_STATIC_MPVQT=ON`) and the Flatpak manifest |

## Known loose ends that may belong in the restructuring

- **README:** `README.md` already has the Icefin README (commit `5f739d7`). The user's draft `docs/github/README.md`
  is newer and links `docs/UPSTREAM-README.md`, which doesn't exist yet. To keep that link, copy upstream's README
  from `icefin/base` (`git show icefin/base:README.md`) into that file.
- **Stack layers out of place:** force pushes were denied, so all later work (audio, lab tooling, backport
  `cabddc6`) sits on `icefin/theme`/`main`, and the lower layers are frozen at `32b3417`. Restructuring branches
  needs the same force-push approval. If the user approves one, it's a good moment for the restack (`docs/BRANCHES.md`).
- **Upstream tags:** they aren't on GitHub. Pushing `v2.0.0` (or all of them) is a choice for the user. Icefin's own
  tags would need a prefix or scheme that can't collide with upstream's `v*` tags.
- **Repo metadata:** no topics, homepage or social preview yet. The wiki is enabled but empty.
- **No branch protection.** If you add it to `icefin/main`, allow the owner's direct pushes, or Claude Code's
  workflow (commit then push to `icefin/main`) breaks. Required checks would be `icefin-hooks` and `icefin-flatpak`.
- **Never committed:** `tests/icefin/htpc/htpc.env` (the HTPC's address), `.claude/phone-alerts.local.json`, and
  `build-htpc/` (it contains the kit with this workstation's public key).

## Handing back to Claude Code

When you're done, add a short entry under **Result** below, covering:
- what changed: branches, paths, default branch, settings;
- what Claude Code must update locally;
- anything it shouldn't touch.

Claude Code will then:
1. fetch and prune, then reset its local branches to the new layout;
2. update the files in the dependency table;
3. run `scripts/icefin/hook-count.sh` and wait for CI to pass;
4. check that the lab still syncs (`scripts/lab.sh run true`) and that the progress page still generates;
5. note the change in `docs/HANDOFF.md`, and in `docs/DECISIONS.md` if any choice was made.

Development resumes only after that, and only when the user says so.

## Result

**2026-11-08, Claude Cowork.** The user chose: trunk-based fork (B); PRs into `main` with owner bypass; full tidy-up; Icefin owns `v*`, upstream tags namespaced. Recorded as **D17**; the guide is `docs/BRANCHING.md`.

### Done from Cowork
- Pushed branch `upstream/master` (mirror of jellyfin-desktop `master`, `3fa72e5`).
- PR `chore/repo-restructure` into `icefin/main`, containing:
  - moves: `ai-assets/` → `docs/standards/`; `docs/HANDOFF.md` and this file → `docs/dev/`;
  - removed: `pdf/` (the PDF goes on releases; `/pdf/` is ignored), `scripts/bootstrap-fork.sh`, `scripts/icefin/restack.sh`, `docs/BRANCHES.md`, upstream's Markdown issue templates;
  - CI: workflows trigger on `main` and on every PR; `icefin-rebase-canary` → `icefin-upstream-canary` (test-merges `upstream/master` into `main`); new `icefin-upstream-mirror` (daily fast-forward of the mirror branch);
  - `hook-count.sh` base = `merge-base(HEAD, upstream/master)` (falls back to `origin/upstream/master`); dependabot targets `main`;
  - community files: `.github/` CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CODEOWNERS, PR template, issue forms (bug, feature, theme) and `config.yml`; root `CHANGELOG.md`;
  - README: progress bar (from `node scripts/progress.mjs`, which now also writes `docs/progress/progress-bar.svg`), design mock-ups (`docs/images/mockups/`), Contributing section;
  - doc updates: `CLAUDE.md`, `docs/dev/HANDOFF.md`, `docs/USAGE-PLAN.md`, `docs/DECISIONS.md` (D14 note, D17), PLAN 10.1, SPEC branch-model note.

### Blocked in Cowork: Claude Code runs these with the user's `gh` login
The Cowork session's GitHub proxy refuses tag pushes, branch deletes and renames, and settings writes. Run in order from the repo root; stop and report if one fails.

```sh
R=Stealthx3/icefin-player
git fetch origin --prune

# 0. If the PR is still open: merge it (squash) once both checks pass.
gh pr merge chore/repo-restructure --repo $R --squash --delete-branch

# 1. Archive tags for the old layers, plus the upstream base tag
for l in base infra brand flatpak audio gpu render hdr input theme; do
  git tag -a "archive/layer-$l" "origin/icefin/$l" -m "Retired stacked branch icefin/$l (D17)"
done
git tag -a upstream/v2.0.0 1634d3d263b881dccc62bf278d1289b471ec7af1 -m "jellyfin-desktop v2.0.0, Icefin's base"
git push origin 'refs/tags/archive/*' refs/tags/upstream/v2.0.0

# 2. Rename the default branch (GitHub retargets open PRs and redirects the old name)
gh api -X POST "repos/$R/branches/icefin%2Fmain/rename" -f new_name=main

# 3. Delete the retired branches and the junk probe branch
for b in base infra brand flatpak audio gpu render hdr input theme; do git push origin --delete "icefin/$b"; done
git push origin --delete test-push-probe

# 4. Branch protection on main (owner can bypass: enforce_admins false)
gh api -X PUT "repos/$R/branches/main/protection" --input - <<'JSON'
{"required_status_checks":{"strict":false,"contexts":["hooks","flatpak"]},
 "enforce_admins":false,
 "required_pull_request_reviews":{"required_approving_review_count":0},
 "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
JSON

# 5. Repo settings, description, topics, private vulnerability reporting
gh api -X PATCH "repos/$R" -F allow_squash_merge=true -F allow_merge_commit=true -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_auto_merge=true \
  -f description="Themeable, HTPC-first Jellyfin client for Linux: theme engine, HDR, HDMI passthrough, controllers. Fork of Jellyfin Desktop."
gh api -X PUT "repos/$R/topics" -f 'names[]=jellyfin' -f 'names[]=htpc' -f 'names[]=mpv' -f 'names[]=hdr' \
  -f 'names[]=flatpak' -f 'names[]=wayland' -f 'names[]=qt6' -f 'names[]=media-player'
gh api -X PUT "repos/$R/private-vulnerability-reporting"
```

The check contexts are the job ids `hooks` and `flatpak`; if GitHub lists them differently under *Settings → Branches*, use the names shown there. The social preview image is set by hand in *Settings → General*.

### Local reset (every clone, including the user's disk copy)
```sh
git fetch origin --prune --prune-tags
git switch -C main origin/main && git branch -u origin/main
git branch -D icefin/main icefin/base icefin/infra icefin/brand icefin/flatpak icefin/audio icefin/gpu icefin/render icefin/hdr icefin/input icefin/theme 2>/dev/null || true
git remote set-head origin -a
git config remote.upstream.tagOpt --no-tags
git config --add remote.upstream.fetch '+refs/tags/*:refs/tags/upstream/*'
git tag -d $(git tag -l 'v*') 2>/dev/null || true   # drop un-prefixed upstream tags, if any were fetched
```
Leave the user's uncommitted `docs/github/README.md` and their `scripts/bootstrap-fork.sh` edits alone; both files are now superseded (the README is in the repo root and the script was removed), so tell the user they can delete them.

### Then verify
1. `scripts/icefin/hook-count.sh` reports OK on `main`; CI is green on `main`.
2. `scripts/lab.sh run true` still syncs, and `node scripts/progress.mjs` writes both the page and the bar; republish the progress artifact.
3. `git ls-remote origin` shows only `main` and `upstream/master` as branches, and the `archive/*` and `upstream/v2.0.0` tags.
4. Add a journal line, then wait for the user to say continue.

### Done by Claude Code (2026-11-08)
- Step 0 skipped (PR #1 already merged as `01fea99`). Steps 1–5 ran without errors, in order:
  - archive tags `archive/layer-{base,infra,brand,flatpak,audio,gpu,render,hdr,input,theme}` and `upstream/v2.0.0` created from `origin/icefin/*` and pushed before any delete;
  - `icefin/main` renamed to `main`, which is now the default branch;
  - deleted `icefin/{base,infra,brand,flatpak,audio,gpu,render,hdr,input,theme}`, `test-push-probe` and `chore/repo-restructure`;
  - protection on `main`: required checks `hooks` and `flatpak` (names confirmed from PR #1's runs), 0 approvals, `enforce_admins` false, no force pushes or deletions;
  - repo settings, description, eight topics, private vulnerability reporting on.
- Local reset done in the only clone (`/mnt/FileDrive/Personal/Projects/Git/icefin-player`; the lab guests get rsync copies without `.git`). Upstream tags now fetch as `upstream/v*`.
  - The user's edited `scripts/bootstrap-fork.sh` blocked the switch, since `main` deletes that file. The edits were stashed (`stash@{0}`) and the identical file put back as untracked. `docs/github/README.md` was untouched. Both are superseded.
- Verified:
  - `hook-count.sh` OK on `main`; `icefin-hooks` green on `main`;
  - `lab.sh run true` syncs;
  - `progress.mjs` writes the page and the bar, and the progress artifact is republished;
  - `git ls-remote origin` lists only `main` and `upstream/master` as branches (plus GitHub's own `refs/pull/1/head`), with the 11 tags.
- Stale names: only history remains (SPEC's superseded branch-model block, PLAN 1.1/1.2 wording, dated log entries). Live references fixed in the hand-back PR.
