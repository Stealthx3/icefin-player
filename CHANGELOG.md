# Changelog

All notable changes to Icefin Player are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Upstream merges are listed with the upstream version they bring in.

## [Unreleased]

### Added
- Fork of jellyfin-desktop v2.0.0, rebranded Icefin Player (`io.github.stealthx3.IcefinPlayer`).
- Flatpak manifest and CI build.
- Audio subsystem work (Phase 3): backend selection, receiver detection, passthrough decisions and fallbacks. See `docs/PLAN.md` for task-level status.
- Contributor docs: `.github/` community files, `docs/BRANCHING.md`, this changelog.

### Changed
- Repository moved to a trunk-based layout: default branch `main`, pull requests into `main`, an `upstream/master` mirror, and namespaced upstream tags (`upstream/v*`).

### Upstream base
- jellyfin-desktop v2.0.0 (`1634d3d`).
