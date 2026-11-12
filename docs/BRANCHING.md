# Branching, upstream and releases

Icefin uses a trunk-based workflow (decision D17). `main` is always buildable; every change reaches it through a pull request.

## Branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Default branch; the Icefin product | Protected: changes arrive by pull request with `icefin-hooks` and `icefin-flatpak` passing; no force pushes or deletion. The owner can bypass in an emergency. |
| `feat/<task>-<topic>` | New work, one PLAN task or a small group, for example `feat/3.6-never-silent` | Short-lived; branch from `main`, squash-merge, delete after merge. |
| `fix/…`, `docs/…`, `ci/…`, `chore/…` | Bug fixes, docs, CI, housekeeping | Same as `feat/`. |
| `theme/<id>` | One bundled theme's completeness pass, for example `theme/plaza` (D29) | Long-lived, one per theme in `themes/`. Work for that theme only (its `themes/<id>/` files, its tests and reference spec) lands here, directly or from short `feat/` branches cut from it. It reaches `main` by pull request with a **merge commit**, not squashed, so the branch can keep going without conflicts. Open that pull request from a throwaway `merge/<theme>-<task>` branch at the same commit, not from `theme/<id>` itself: the repository deletes a pull request's head branch on merge. It takes engine changes by merging `main` in. Engine work that every theme needs still goes to `main` on `feat/` branches. |
| `upstream/master` | Read-only mirror of `jellyfin/jellyfin-desktop` `master` | Fast-forwarded daily by the `icefin-upstream-mirror` workflow. Never commit to it. |
| `sync/upstream-<version>` | One upstream merge (see below) | Merged into `main` with a **merge commit**, not squashed, so upstream history stays intact. |

The old stacked layer branches (`icefin/base`, `icefin/infra` … `icefin/theme`) were retired on 2026-11-08. Every one of them was already contained in `main`; each is preserved as an `archive/layer-<name>` tag.

## Pull requests

1. `git switch -c feat/<task>-<topic> main`
2. Commit. Tick the PLAN box, run `node scripts/progress.mjs` (it refreshes both the progress page and the README progress bar) and add the journal line in the same PR as the work (PROGRESS-BAR and POST-MORTEM standards).
3. Push and open a PR into `main` using the template.
4. Wait for `icefin-hooks` and `icefin-flatpak` to pass, then squash-merge. The branch is deleted on merge.

## Staying rebasable on upstream

Rebasability comes from where code lives, not from branches:

- Icefin code lives only in `src/icefin/`, `native/icefin/`, `qml/icefin/`, `external/mpv/`, `flatpak/` and `themes/`.
- Upstream files get small hooks marked `ICEFIN-HOOK: <reason>`. `scripts/icefin/hook-count.sh` and the `icefin-hooks` check enforce this.
- The hook check's base is the newest upstream commit already merged into `main`, computed from the `upstream/master` mirror, so it moves forward by itself after each upstream merge.
- Exempt from the hook rule: `README.md`, which Icefin replaces wholesale with upstream credited inside. Deleted upstream files are not checked; upstream's issue templates were replaced this way.

## Merging an upstream release

1. Watch the daily `icefin-upstream-canary` run, which test-merges `upstream/master` into `main` and fails on conflicts.
2. For a release, for example `v2.1.0`:
   ```sh
   git fetch upstream --no-tags 'refs/tags/v2.1.0:refs/tags/upstream/v2.1.0'
   git switch -c sync/upstream-v2.1.0 main
   git merge --no-ff upstream/v2.1.0 -m "Merge upstream jellyfin-desktop v2.1.0"
   ```
3. Resolve conflicts, keeping every `ICEFIN-HOOK` line. Run the full suite in the lab.
4. Open a PR and merge it with a **merge commit**.
5. Push the tag `upstream/v2.1.0` and record the new base in `docs/DECISIONS.md` and `CHANGELOG.md`.

## Tags

| Pattern | Meaning |
|---|---|
| `v<semver>` | Icefin releases, for example `v0.1.0-alpha.1`, `v1.0.0`. Each gets a GitHub Release and a `CHANGELOG.md` entry. |
| `upstream/v<version>` | Upstream jellyfin-desktop releases Icefin has merged. Upstream's own `v*` tags are never pushed un-prefixed, so they can't collide with Icefin's. |
| `archive/<name>` | Retired branches, kept for history. |

So upstream tags never land in Icefin's `v*` namespace, configure the local `upstream` remote like this:

```sh
git config remote.upstream.tagOpt --no-tags
git config --add remote.upstream.fetch '+refs/tags/*:refs/tags/upstream/*'
```

## Releases

Releases follow Semantic Versioning, with pre-releases (`-alpha.N`, `-beta.N`) before 1.0. `CHANGELOG.md` follows Keep a Changelog: entries collect under *Unreleased* and move into a version section when it is tagged. Flatpak bundles and the plan PDF are attached to the GitHub Release.
