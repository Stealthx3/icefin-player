# Contributing to Icefin Player

Thanks for your interest. Icefin is in alpha and mostly developed by one person, but issues, ideas and pull requests are welcome.

Icefin is a fork of [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop). Please report bugs in Icefin here, not to the Jellyfin project.

## Before you start
- Read the [README](../README.md), the [plan](../docs/PLAN.md) and the [design spec](../docs/SPEC.md).
- Settled design choices are listed in [`docs/DECISIONS.md`](../docs/DECISIONS.md). Open an issue before proposing to change one.
- Branching, upstream merges and releases are described in [`docs/BRANCHING.md`](../docs/BRANCHING.md).

## Ground rules
- **Keep upstream mergeable.** Put new code in `src/icefin/`, `native/icefin/`, `qml/icefin/`, `external/mpv/`, `flatpak/` or `themes/`. In upstream files, add only small hooks marked `ICEFIN-HOOK: <reason>`. Run `scripts/icefin/hook-count.sh` before opening a PR.
- **No vendor assets.** Themes may copy a layout, its proportions, navigation, timing and colors, but never logos, icons, artwork, sounds, characters, proprietary fonts or product names.
- **Build and test in a VM or container**, not on your workstation. See [`docs/LAB.md`](../docs/LAB.md).
- **License:** contributions are accepted under GPL-2.0, the project's license.

## Pull requests
1. Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `ci/…` or `chore/…`.
2. Keep each PR to one task or fix. If it completes a PLAN task, tick its box in the same PR.
3. Fill in the PR template. `icefin-hooks` and `icefin-flatpak` must pass.
4. PRs are squash-merged.

## Reporting security issues
Please don't open a public issue. See [SECURITY.md](SECURITY.md).
