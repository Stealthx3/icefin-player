# Branches

Stack (bottom to top), each layer based on the one below. See SPEC "Fork, branding and upstream sync".

| Branch | Holds |
|---|---|
| `icefin/base` | upstream release tag (now `v2.0.0`); never committed to |
| `icefin/infra` | Icefin docs, standards, tooling, Icefin CI; touches no upstream files |
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
