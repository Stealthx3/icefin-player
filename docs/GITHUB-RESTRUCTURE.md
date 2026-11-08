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

_(Cowork: fill in.)_
