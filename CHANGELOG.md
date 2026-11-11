# Changelog

All notable changes to Icefin Player are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Upstream merges are listed with the upstream version they bring in.

## [Unreleased]

## [0.1.0-alpha.1] - 2026-11-11

First alpha. Everything below is tested in the virtual lab (`docs/LAB.md`); testers' hardware comes next (`docs/BETA-CHECKLIST.md`).

### Added
- Theme engine: themed screens over jellyfin-web, design tokens, colour schemes (a dark scheme for every theme, usable with any theme), UI sounds, a native backdrop, a stable theme script API, package validation and trust levels, and a theme manager in Client Settings with a live preview and install from file.
- Themes: Baseline, the Media Center reference theme, and eleven layout themes (Harbor, Spark, Plum, Plaza, Orbit, Mosaic, Lumen, Marquee, Almanac, Arcade, Tide), each with themed details pages, player controls and a settings area (Client settings, Classic View, Server Settings).
- Vulkan renderer: UI and video on one surface, linear-light compositing, HDR10 and HLG output on Wayland (colour management) and Gamescope, an OpenGL fallback, and a capability prompt instead of wrong colours.
- Audio: backend choice (PipeWire, PulseAudio, JACK, ALSA), receiver detection from the HDMI ELD, per-track passthrough decisions, runtime bitstream formats, exclusive ALSA with device reservation, a never-silent fallback, per-device delay and an audio test page.
- GPU: decoder self-test and a Hardware page, hardware decoding options, zero-copy decode, a client-side capability model and an automatic device profile.
- Controllers: SDL3 with hotplug, a standard action map, per-controller remapping, a Nintendo layout option and glyph detection.
- Fork of jellyfin-desktop v2.0.0, rebranded Icefin Player (`io.github.stealthx3.IcefinPlayer`).
- Flatpak manifest and CI build.
- Audio subsystem work (Phase 3): backend selection, receiver detection, passthrough decisions and fallbacks. See `docs/PLAN.md` for task-level status.
- Contributor docs: `.github/` community files, `docs/BRANCHING.md`, this changelog.

### Changed
- Repository moved to a trunk-based layout: default branch `main`, pull requests into `main`, an `upstream/master` mirror, and namespaced upstream tags (`upstream/v*`).

### Upstream base
- jellyfin-desktop v2.0.0 (`1634d3d`).

[Unreleased]: https://github.com/Stealthx3/icefin-player/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/Stealthx3/icefin-player/releases/tag/v0.1.0-alpha.1
