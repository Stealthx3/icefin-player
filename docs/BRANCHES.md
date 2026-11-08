# Branches

Stack (bottom to top), each layer based on the one below. See SPEC "Fork, branding and upstream sync".

| Branch | Holds |
|---|---|
| `icefin/base` | upstream release tag (now `v2.0.0`); never committed to |
| `icefin/infra` | initial Icefin docs, standards, tooling and CI (frozen after setup); touches no upstream files |
| `icefin/brand` | branding, app ID, paths (1.3), hook-marker convention (1.4) |
| `icefin/flatpak` | `flatpak/` manifest, Flatpak CI, update-check removal (1.5, 1.6) |
| `icefin/audio` · `gpu` · `render` · `hdr` · `input` · `theme` | the matching SPEC sections |
| `icefin/main` | = `icefin/theme` (the whole stack), the default branch |

The `infra` layer is an addition to the SPEC list. It keeps docs and tooling out of the feature layers.

Workflow: `git switch icefin/<layer>`, commit, then `scripts/icefin/restack.sh --push`. The script replays the
layers above, fast-forwards `icefin/main` and force-pushes with lease.
Nightly: `.github/workflows/icefin-rebase-canary.yml` rebases the stack onto upstream `master` and fails on conflicts.

Plan ticks, the regenerated progress page and journal lines go in the same commit as the work, in whatever layer that is
(the progress standard requires it). They only touch `docs/`, so the worst case is a trivial conflict in `docs/PLAN.md` when restacking.

Upstream backports (fixes from upstream commits newer than `icefin/base`) belong in `icefin/brand`, the lowest code layer, as
`ICEFIN-HOOK: backport upstream <sha>` lines. They drop out at the next upstream sync (10.1).

After setup, docs, plan ticks, test tooling and lab scripts are committed on the stack top (`icefin/theme`, = `icefin/main`):
they touch no upstream files, and keeping them in one layer avoids restack conflicts in `docs/PLAN.md`.

**Restacking needs a force push** (it rewrites layers already on GitHub), and force pushes need the user's
approval in this environment. Until that is granted, new commits are fast-forwarded onto the top layer that
owns them or above it (e.g. the cabddc6 backport sits on `icefin/theme` instead of `icefin/brand`) and are moved
to their proper layer in one approved restack, at the latest before the Phase 10 upstream sync.
